import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSerpApi, mapPlace } from '../agent/serpapi.mjs';

let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error('REAL NETWORK FORBIDDEN'); };
after(() => assert.equal(networkAttempts, 0, 'A test reached the default network fetch'));
const place = { title: 'Test', gps_coordinates: { latitude: 35.7, longitude: 139.7 }, phone: '０１２０ ０００ １１１' };
const env = { SERPAPI_API_KEY: 'synthetic-secret', SERPAPI_LIVE: '1' };
const query = { name: 'Test', lat: 35.5, lon: 139.5 };
const response = data => new Response(JSON.stringify(data));
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'chirashi-serpapi-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const fetch = async (url, init) => {
    calls++;
    return options.respond ? options.respond(url, init) : response({ place_results: place });
  };
  const args = { dir, env, fetch, ...options };
  return { dir, args, api: createSerpApi(args), calls: () => calls };
}

test('not live and disabled spend nothing, including the forbidden default fetch', async t => {
  const { dir } = await setup(t);
  const api = createSerpApi({ dir, env: { SERPAPI_API_KEY: 'synthetic' } });
  assert.equal((await api.search(query)).reason, 'not-live');
  assert.equal((await createSerpApi({ dir, env: { SERPAPI_LIVE: '1' } }).search(query)).reason, 'disabled');
});
test('live URL, normalized cache, sanitation and free offline cache hit', async t => {
  const { api, calls, dir } = await setup(t, { respond: (url, init) => {
    assert.equal(url.origin, 'https://serpapi.com');
    for (const [key, value] of Object.entries({ engine: 'google_maps', type: 'search', hl: 'ja', q: 'Test', ll: '@35.5,139.5,14z' })) assert.equal(url.searchParams.get(key), value);
    assert.ok(init.signal instanceof AbortSignal);
    return response({ place_results: { ...place, api_key: 'secret', hours: { api_key: 'secret', monday: '10–18' } },
      local_results: Array(5).fill(place), search_metadata: { url: 'https://example.test/?api_key=secret' } });
  } });
  assert.equal((await api.search(query)).reason, 'live');
  assert.equal((await api.search({ ...query, name: ' ＴＥＳＴ ' })).reason, 'cache');
  const offline = createSerpApi({ dir, env: {} });
  assert.equal((await offline.search(query)).reason, 'cache');
  assert.equal(calls(), 1); assert.equal((await api.status()).monthCount, 1);
  const files = (await readdir(dir)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
  const saved = await readFile(join(dir, files[0]), 'utf8');
  assert.doesNotMatch(saved, /api_key|search_metadata|synthetic-secret/);
  assert.equal(JSON.parse(saved).response.local_results.length, 3);
});
test('sixth search blocked and ledger persists between instances', async t => {
  const { api, calls, args } = await setup(t);
  for (let index = 0; index < 5; index++) assert.equal((await api.search({ ...query, name: String(index) })).reason, 'live');
  const second = createSerpApi(args);
  assert.equal((await second.search(query)).reason, 'budget'); assert.equal(calls(), 5);
  assert.equal((await second.status()).dayCount, 5);
});
test('Japan midnight resets day only, Japan month rollover resets both', async t => {
  let date = new Date('2026-10-10T14:59:00Z');
  const { api } = await setup(t, { now: () => date });
  await api.search(query);
  date = new Date('2026-10-10T15:00:00Z');
  assert.equal((await api.status()).dayCount, 0); assert.equal((await api.status()).monthCount, 1);
  await api.search({ ...query, name: 'next day' });
  date = new Date('2026-10-31T15:00:00Z');
  const status = await api.status(); assert.equal(status.dayCount, 0); assert.equal(status.monthCount, 0);
});
test('monthly limit and invalid limits fail closed', async t => {
  const { api, calls } = await setup(t, { env: { ...env, SERPAPI_MONTHLY_LIMIT: '1' } });
  await api.search(query); assert.equal((await api.search({ ...query, name: 'other' })).reason, 'budget'); assert.equal(calls(), 1);
  const { api: invalid } = await setup(t, { env: { ...env, SERPAPI_DAILY_LIMIT: 'bad' } });
  assert.equal((await invalid.search(query)).reason, 'budget');
});
test('account reconciliation is free and reserve of 20 blocks search', async t => {
  const { api, calls, dir } = await setup(t, { respond: url => {
    assert.equal(url.pathname, '/account.json'); return response({ plan_searches_left: 20, total_searches_left: 99 });
  } });
  assert.deepEqual(await api.reconcile(), { accountLeft: 20 });
  assert.equal((await api.search(query)).reason, 'budget'); assert.equal(calls(), 1);
  assert.equal((await api.status()).dayCount, 0);
  assert.equal(JSON.parse(await readFile(join(dir, 'usage.json'))).accountLeft, 20);
});
test('total_searches_left supported; account errors ignored', async t => {
  const { api } = await setup(t, { respond: () => response({ total_searches_left: 80 }) });
  await api.reconcile(); assert.equal((await api.status()).accountLeft, 80);
  const { api: bad } = await setup(t, { respond: () => new Response('', { status: 500 }) });
  assert.equal(await bad.reconcile(), null);
});
test('concurrent identical requests share one fetch; distinct requests cannot overspend', async t => {
  const { api, calls, args } = await setup(t);
  const results = await Promise.all(Array.from({ length: 10 }, () => api.search(query)));
  assert.equal(calls(), 1); assert.ok(results.every(value => value.reason === 'live'));
  const second = createSerpApi(args);
  const distinct = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? api : second).search({ ...query, name: `new-${i}` })));
  assert.equal(distinct.filter(value => value.reason === 'live').length, 4); assert.equal(calls(), 5);
});
test('offline instance does not join a live instance in flight', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { api, args } = await setup(t, { respond: async () => { await gate; return response({ place_results: place }); } });
  const pending = api.search(query);
  const offline = createSerpApi({ ...args, env: { ...env, SERPAPI_LIVE: '0' } });
  assert.equal((await offline.search(query)).reason, 'not-live');
  release(); await pending;
});
test('JSON error, non-2xx and thrown fetch still consume reservations', async t => {
  for (const respond of [() => response({ error: 'bad' }), () => new Response('', { status: 500 }), () => { throw new Error('failed'); }]) {
    const { api } = await setup(t, { respond });
    assert.deepEqual(await api.search(query), { result: null, reason: 'error' });
    assert.equal((await api.status()).dayCount, 1);
  }
});
test('expired cache misses; ledger reservation exists before fetch; corrupt ledger fails closed', async t => {
  let date = new Date('2026-10-01T00:00:00Z'), dir;
  const setupResult = await setup(t, { now: () => date, respond: async () => {
    const saved = JSON.parse(await readFile(join(dir, 'usage.json'))); assert.ok(saved.dayCount >= 1);
    return response({ place_results: place });
  } });
  dir = setupResult.dir; await setupResult.api.search(query);
  date = new Date('2026-11-01T00:00:00Z');
  assert.equal((await setupResult.api.search(query)).reason, 'live');
  await writeFile(join(dir, 'usage.json'), '{broken');
  assert.equal((await setupResult.api.search({ ...query, name: 'other' })).reason, 'error');
  assert.equal(setupResult.calls(), 2);
});
test('mapPlace prioritizes place_results, local_results, GPS validity and phone matches', () => {
  const direct = mapPlace({ place_results: place, local_results: [{ ...place, title: 'ignored' }] }, ['0120-000-111']);
  assert.equal(direct.place.title, 'Test'); assert.equal(direct.place.phoneMatches, true);
  assert.equal(mapPlace({ local_results: [place] }, ['different']).place.phoneMatches, false);
  assert.equal(mapPlace({ place_results: { title: 'no GPS' } }), null);
  assert.equal(mapPlace({ local_results: [{ gps_coordinates: { latitude: '35', longitude: 139 } }] }), null);
  assert.equal(mapPlace({}), null);
});
