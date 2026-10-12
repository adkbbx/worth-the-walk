import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createOsm } from '../agent/osm.mjs';

const originalFetch = globalThis.fetch;
let networkAttempts = 0;
before(() => { globalThis.fetch = async () => { networkAttempts++; throw new Error('REAL NETWORK FORBIDDEN'); }; });
after(() => { globalThis.fetch = originalFetch; assert.equal(networkAttempts, 0); });
const response = data => new Response(JSON.stringify(data));
const start = { name: 'テスト店', lat: 35.5, lon: 139.5 };
const poi = (name = start.name, lat = '35.505', lon = '139.505', extratags = {}) => ({ name, lat, lon, extratags });
function fakeClock() {
  let value = 0;
  return { now: () => value, sleep: async ms => { value += ms; }, advance: ms => { value += ms; } };
}

test('OSM sends a bounded Japanese search from the rounded start with a policy User-Agent', async () => {
  let calls = 0;
  const osm = createOsm({ env: {}, clock: fakeClock(), fetch: async (url, init) => {
    calls++;
    assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      format: 'jsonv2', q: start.name, countrycodes: 'jp', viewbox: '139.47,35.53,139.53,35.47',
      bounded: '1', limit: '5', 'accept-language': 'ja', extratags: '1',
    });
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['User-Agent'], 'WorthTheWalk/0.1 (+https://github.com/adkbbx/worth-the-walk)');
    assert.ok(init.signal instanceof AbortSignal);
    return response([poi()]);
  } });
  assert.equal(osm.enabled, true);
  assert.deepEqual(await osm.search(start), { lat: 35.505, lon: 139.505, source: 'osm', precision: 'poi', title: start.name, phoneMatch: false });
  await osm.search({ ...start, lat: 35.500123, lon: 139.500123 });
  assert.equal(calls, 1, 'extra start precision is discarded');
});

test('OSM normalizes names and selects the nearest matching POI, ignoring nearer unrelated names', async () => {
  const osm = createOsm({ env: {}, clock: fakeClock(), fetch: async () => response([
    poi('Other', '35.5', '139.5'), poi('ＴＥＳＴ・Ｃａｆｅ 支店', '35.52'),
    poi('test cafe', '35.501'), poi('test cafe', 'bad'), poi('test cafe', '91'),
  ]) });
  const result = await osm.search({ ...start, name: 'Test-Cafe!' });
  assert.equal(result.title, 'test cafe'); assert.equal(result.lat, 35.501);
  assert.equal((await osm.search({ ...start, name: 'Test Cafe 本店' })).lat, 35.501, 'reverse containment also matches');
});

test('OSM does not guess on a name mismatch or accept empty names and invalid coordinates', async () => {
  let calls = 0;
  const osm = createOsm({ env: {}, clock: fakeClock(), fetch: async () => { calls++; return response([poi('Other')]); } });
  assert.equal(await osm.search(start), null);
  for (const input of [{ ...start, name: '' }, { ...start, name: ' ・ ' }, { ...start, lat: NaN },
    { ...start, lon: 181 }, { name: start.name }, {}]) assert.equal(await osm.search(input), null);
  assert.equal(calls, 1);
});

test('OSM returns null on fetch errors, non-200 responses, malformed JSON and invalid payloads', async () => {
  for (const fetch of [async () => { throw new Error('synthetic'); },
    async () => new Response('[]', { status: 500 }), async () => new Response('[]', { status: 201 }),
    async () => new Response('{bad'), async () => response({ error: 'synthetic' }),
    async () => response([null, {}, poi(start.name, '')])]) {
    const osm = createOsm({ env: {}, clock: fakeClock(), fetch });
    assert.equal(await osm.search(start), null);
  }
});

test('OSM aborts after eight seconds and returns null even if injected fetch ignores the signal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal, started;
  const ready = new Promise(resolve => { started = resolve; });
  const osm = createOsm({ env: {}, clock: fakeClock(), fetch: async (_, init) => {
    signal = init.signal; started(); return new Promise(() => {});
  } });
  const pending = osm.search(start);
  await ready;
  t.mock.timers.tick(7999); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); assert.equal(await pending, null); assert.equal(signal.aborted, true);
});

test('OSM caches hits and not-found results for seven days and returns fresh result objects', async () => {
  const clock = fakeClock();
  let calls = 0;
  const osm = createOsm({ env: {}, clock, fetch: async url => {
    calls++; return response(url.searchParams.get('q') === 'Missing' ? [] : [poi()]);
  } });
  const first = await osm.search(start); first.lat = 0;
  assert.equal((await osm.search(start)).lat, 35.505); assert.equal(calls, 1);
  assert.equal(await osm.search({ ...start, name: 'Missing' }), null);
  assert.equal(await osm.search({ ...start, name: 'Missing' }), null); assert.equal(calls, 2);
  clock.advance(7 * 86400000);
  await osm.search(start); await osm.search({ ...start, name: 'Missing' });
  assert.equal(calls, 4);
});

test('OSM LRU holds 500 queries and refreshes recently used entries', async () => {
  let calls = 0;
  const osm = createOsm({ env: {}, clock: fakeClock(), fetch: async () => { calls++; return response([]); } });
  const search = name => osm.search({ ...start, name: String(name) });
  for (let i = 0; i < 500; i++) await search(i);
  await search(0); await search(500); await search(0); assert.equal(calls, 501);
  await search(1); assert.equal(calls, 502);
});

test('OSM spaces request starts by at least 1100 ms across clients and recovers after a failed request', async () => {
  const clock = fakeClock(), starts = [];
  const first = createOsm({ env: {}, clock, fetch: async () => { starts.push(clock.now()); throw new Error('synthetic'); } });
  const second = createOsm({ env: {}, clock, fetch: async () => { starts.push(clock.now()); return response([]); } });
  await Promise.all([first.search(start), second.search(start), second.search({ ...start, name: 'Other' })]);
  assert.equal(starts.length, 3);
  assert.ok(starts[1] - starts[0] >= 1100); assert.ok(starts[2] - starts[1] >= 1100);
});

test('OSM shares identical in-flight queries across clients while matching each caller phone independently', async () => {
  let finish, started, calls = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const fetch = async () => { calls++; started(); return new Promise(resolve => { finish = resolve; }); };
  const clock = fakeClock();
  const first = createOsm({ env: {}, fetch, clock }), second = createOsm({ env: {}, fetch, clock });
  const a = first.search({ ...start, phones: ['0120-000-111'] });
  const b = second.search({ ...start, phones: ['0120-000-222'] });
  await ready; assert.equal(calls, 1);
  finish(response([poi(start.name, '35.505', '139.505', { 'contact:phone': '０１２０ ０００ １１１' })]));
  assert.equal((await a).phoneMatch, true); assert.equal((await b).phoneMatch, false);
  assert.equal((await second.search({ ...start, phones: ['0120000111'] })).phoneMatch, true);
  assert.equal(calls, 1);
});

test('OSM matches extratags phone and never matches digit-free phones', async () => {
  const osm = createOsm({ env: {}, clock: fakeClock(), fetch: async () => response([poi(start.name, '35.505', '139.505', { phone: '03-1234-5678' })]) });
  assert.equal((await osm.search({ ...start, phones: ['0312345678'] })).phoneMatch, true);
  assert.equal((await osm.search({ ...start, phones: ['bad'] })).phoneMatch, false);
});

test('OSM_LOOKUP=0 disables lookup without fetching', async () => {
  let calls = 0;
  const osm = createOsm({ env: { OSM_LOOKUP: '0' }, fetch: async () => { calls++; throw new Error('Unexpected fetch'); } });
  assert.equal(osm.enabled, false); assert.equal(await osm.search(start), null); assert.equal(calls, 0);
});
