import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTabPFN, rulesRank } from '../agent/tabpfn.mjs';
import { FEATURES } from '../src/mailbox.mjs';

let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error('REAL NETWORK FORBIDDEN'); };
after(() => assert.equal(networkAttempts, 0, 'A test reached the default network fetch'));
const train = Array.from({ length: 6 }, (_, i) => ({ row: [0, i, 0, i % 2, 0, 10, 0, 0, 1], label: i % 2 }));
const predict = [{ id: 'a', row: train[0].row }, { id: 'b', row: train[1].row }];
const body = { train, predict };
const command = file => ({ file, upload_command: `curl --fail-with-body --request PUT -H 'Content-Type: text/csv' -H 'Host: storage.test' -H 'X-Goog-Content-Length-Range: 0,5368709120' --upload-file <file> 'https://storage.test/${file}?signature=fake'` });
function fake(options = {}) {
  const calls = [], uploads = []; let time = 0, polls = 0, connections = 0, closes = 0;
  const connect = async () => {
    connections++;
    return { close: async () => { closes++; }, callTool: async ({ name, arguments: args }) => {
      calls.push({ name, args });
      if (name === 'prepare_train_set_upload') return { train_set_upload_id: 'train-id', uploads: [command('x_train.csv'), command('y_train.csv')] };
      if (name === 'fit') return { fitted_train_set_id: 'fit-id' };
      if (name === 'get_fit_status') return { status: options.timeout || polls++ === 0 ? 'running' : 'completed' };
      if (name === 'prepare_test_set_upload') return { test_set_upload_id: 'test-id', uploads: [command('x_test.csv')] };
      if (name === 'predict') return { prediction_uri: 'https://storage.test/result', metadata: { classes: [1, 0] } };
      throw new Error('Unexpected tool');
    } };
  };
  const fetch = async (url, init) => {
    if (init?.method === 'PUT') {
      assert.equal(init.headers['Content-Type'], 'text/csv'); assert.equal(init.headers.Host, 'storage.test');
      assert.equal(init.headers['X-Goog-Content-Length-Range'], '0,5368709120');
      assert.equal(init.headers.Authorization, undefined);
      uploads.push({ url, body: init.body }); return new Response('');
    }
    return new Response(JSON.stringify(options.malformed ? [[2, -1]] : [[0.8, 0.2], [0.1, 0.9]]));
  };
  return { api: createTabPFN({ env: { PRIOR_LABS_MCP_TOKEN: 'synthetic' }, connect, fetch, now: () => time,
    sleep: async ms => { assert.equal(ms, 1000); time += ms; } }), calls, uploads, connections: () => connections, closes: () => closes };
}
test('upload → fit → poll → test upload → predict maps class one to row ids', async () => {
  const f = fake();
  assert.deepEqual(await f.api.rank(body), { model: 'tabpfn', scores: [{ id: 'a', p: 0.8 }, { id: 'b', p: 0.1 }] });
  assert.deepEqual(f.calls.map(call => call.name), ['prepare_train_set_upload', 'fit', 'get_fit_status', 'get_fit_status', 'prepare_test_set_upload', 'predict']);
  assert.deepEqual(f.calls[1].args, { train_set_upload_id: 'train-id', task: 'classification' });
  assert.equal(f.uploads[0].body.split('\n')[0], FEATURES.join(','));
  assert.equal(f.uploads[1].body, 'label\n0\n1\n0\n1\n0\n1\n');
  assert.equal(f.uploads[2].body.split('\n').length, 4); assert.equal(f.closes(), 1);
});
test('cache reuses fitted training set; changed labels trigger a new fit', async () => {
  const f = fake(); await f.api.rank(body); await f.api.rank({ train, predict: predict.slice(0, 2) });
  assert.equal(f.calls.filter(call => call.name === 'fit').length, 1);
  assert.equal(f.uploads.length, 4);
  await f.api.rank({ train: train.map(row => ({ ...row, label: 1 - row.label })), predict });
  assert.equal(f.calls.filter(call => call.name === 'fit').length, 2);
});
test('45-second polling timeout falls back to rules', async () => {
  const f = fake({ timeout: true }); assert.deepEqual(await f.api.rank(body), rulesRank(body));
  assert.equal(f.calls.filter(call => call.name === 'get_fit_status').length, 45);
  assert.equal(f.calls.filter(call => call.name === 'predict').length, 0);
});
test('malformed prediction falls back to unchanged rules', async () => {
  assert.deepEqual(await fake({ malformed: true }).api.rank(body), rulesRank(body));
});
test('fewer than six rows, one label, missing token and no predictions never connect', async () => {
  const f = fake();
  for (const input of [{ train: train.slice(0, 5), predict }, { train: train.map(row => ({ ...row, label: 1 })), predict }, { train, predict: [] }]) {
    assert.deepEqual(await f.api.rank(input), rulesRank(input));
  }
  assert.equal(f.connections(), 0);
  assert.deepEqual(await createTabPFN({ env: {} }).rank(body), rulesRank(body));
});
test('connector or upload failures return rules', async () => {
  const api = createTabPFN({ env: { PRIOR_LABS_MCP_TOKEN: 'synthetic' }, connect: async () => { throw new Error('synthetic'); } });
  assert.deepEqual(await api.rank(body), rulesRank(body));
});
