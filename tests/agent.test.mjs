import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSerpApi } from '../agent/serpapi.mjs';
import { privacyProcessor, createApp } from '../agent/mastra.mjs';
import { createTools, rulesRank } from '../agent/tools.mjs';
import { createCallQueue, modelCall, hedged } from '../agent/queue.mjs';
import { FEATURES, normalizeTile } from '../src/mailbox.mjs';
import { createServer } from '../scripts/serve.mjs';
import { PAGE_PROMPT, TILE_PROMPT } from '../agent/prompts.mjs';

test('whole-page and tile modes select their own prompts through the hedged reader', async () => {
  const app = createApp({ env: { GRADIENT_MODEL_ACCESS_KEY: 'synthetic' }, fetch: noFetch });
  const calls = [];
  for (const name of ['pageReader','flyerReader']) app.mastra.getAgent(name).generate = async (messages,options) => {
    calls.push({name,messages,options}); return {text:JSON.stringify(fixtures[0])};
  };
  await app.readPage({pageId:'whole',tiles:[image],mode:'page'});
  await app.readPage({pageId:'detail',tiles:[image],mode:'tiles'});
  assert.deepEqual(calls.map(call => call.name),['pageReader','flyerReader']);
  assert.equal(calls[0].messages[0].content[0].text,PAGE_PROMPT);
  assert.equal(calls[1].messages[0].content[0].text,TILE_PROMPT);
  assert.match(PAGE_PROMPT,/ONE whole page/);assert.doesNotMatch(PAGE_PROMPT,/this tile|the tile/);
  assert.ok(calls.every(call => call.options.abortSignal instanceof AbortSignal));
});

test('mock whole-page read returns one normalized synthetic fixture', async () => {
  const app = createApp({env,fetch:noFetch}), events=[];
  const result=await app.readPage({pageId:'whole',tiles:[image],mode:'page'},event=>events.push(event));
  assert.deepEqual(result.tiles,[normalizeTile(fixtures[0])]);
  assert.deepEqual(events.map(event=>event.type),['tile','done']);
});

process.env.MOCK_GEMMA = '1';
const env = { MOCK_GEMMA: '1' };
const image = 'data:image/png;base64,AAAA';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/tiles.json', import.meta.url), 'utf8'));
const noFetch = async () => { throw new Error('External network is forbidden in tests'); };
const originalFetch = globalThis.fetch;
let realNetworkAttempts = 0;
before(() => { globalThis.fetch = async () => { realNetworkAttempts++; throw new Error('REAL NETWORK FORBIDDEN'); }; });
after(() => { assert.equal(realNetworkAttempts, 0, 'A test reached the default network fetch'); globalThis.fetch = originalFetch; });
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const predict = [
  { id: 'trial', row: [0, 1, 0, 1, 2, 1, 0, 0, 1] },
  { id: 'expired', row: [10, 3, -1, 0, 0, -1, 1, 0, 0] },
];
const mergeInput = (tiles = fixtures.slice(0, 2)) => ({ flyerId: 'dojo',
  pages: tiles.map((tile, index) => ({ id: `p${index}`, tiles: [tile] })),
  scanDate: '2026-10-11', home: { stationId: 'test', lat: 35.5, lon: 139.5 } });

test('readPage emits one event per tile and a final ordered list, wrapping fixture indices', async () => {
  const app = createApp({ env, fetch: noFetch });
  const events = [];
  const result = await app.readPage({ pageId: 'front', tiles: Array(9).fill(image) }, event => events.push(event));
  assert.equal(events.length, 10);
  assert.deepEqual(events.slice(0, -1).map(event => event.index).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(events.slice(0, -1).every(event => event.type === 'tile'));
  assert.deepEqual(result, events.at(-1));
  assert.equal(result.type, 'done'); assert.equal(result.pageId, 'front');
  assert.deepEqual(result.tiles, Array.from({ length: 9 }, (_, index) => normalizeTile(fixtures[index % 6])));
  assert.equal(app.mastra.getAgent('flyerReader').name, 'flyer-reader');
  assert.equal(app.mastra.getAgent('flyerMerger').name, 'flyer-merger');
});

test('mock merge combines two dojo pages, finalizes deadlines and chain fields, and locates via injected fetch', async () => {
  let calls = 0;
  const app = createApp({ env, fetch: async () => { calls++; return response([
    { geometry: { coordinates: [139.51, 35.51] }, properties: { title: 'テスト住所' } },
  ]); } });
  const flyer = await app.mergeFlyer(mergeInput());
  assert.equal(flyer.id, 'dojo'); assert.deepEqual(flyer.pageIds, ['p0', 'p1']);
  assert.equal(flyer.bucket, 'walk'); assert.equal(flyer.business.name, fixtures[0].business.name);
  assert.equal(flyer.address, fixtures[1].address); assert.deepEqual(flyer.phones, ['0120-000-111']);
  assert.equal(flyer.deadline, '2026-11-30'); assert.equal(flyer.chain, null);
  assert.equal(flyer.offers[0].page, 0); assert.equal(flyer.offers[0].regular_yen, 3300);
  assert.equal(flyer.needsLookup, false); assert.equal(flyer.location.source, 'gsi'); assert.equal(calls, 1);
});

test('mock mode with no injected fetch skips all lookup, while personal mail returns storable only', async () => {
  const app = createApp({ env });
  const demo = (await app.mergeFlyer(mergeInput())).location;
  assert.equal(demo.source, 'mock');
  const meters = Math.hypot((demo.lat - 35.5) * 111320, (demo.lon - 139.5) * 111320 * Math.cos(35.5 * Math.PI / 180));
  assert.ok(meters >= 249 && meters <= 601, String(meters));
  assert.equal(await app.locate({ q: 'test', name: 'test', lat: 35, lon: 139 }), null);
  let calls = 0;
  const personalApp = createApp({ env, fetch: async () => { calls++; throw new Error('Unexpected lookup'); } });
  assert.deepEqual(await personalApp.mergeFlyer(mergeInput([fixtures[5]])), {
    id: 'dojo', pageIds: ['p0'], bucket: 'keep', category: 'official_or_personal',
  });
  assert.equal(calls, 0);
});

test('all synthetic categories retain existing mailbox behavior', async () => {
  const app = createApp({ env });
  const market = await app.mergeFlyer(mergeInput([fixtures[2]]));
  assert.equal(market.items.length, 3); assert.equal(market.items[0].regular_yen, 198);
  assert.ok(market.items.every(item => item.page === 0));
  assert.equal((await app.mergeFlyer(mergeInput([fixtures[3]]))).bucket, 'home');
  assert.equal((await app.mergeFlyer(mergeInput([fixtures[4]]))).bucket, 'toss');
});

test('GSI maps first result, encodes address, sets 8s signal, and caches results', async () => {
  let calls = 0;
  const tools = createTools({ env, fetch: async (url, init) => {
    calls++; assert.equal(url.origin, 'https://msearch.gsi.go.jp');
    assert.equal(url.searchParams.get('q'), fixtures[1].address);
    assert.ok(init.signal instanceof AbortSignal);
    return response([{ geometry: { coordinates: [139.75, 35.65] }, properties: { title: 'テスト住所' } },
      { geometry: { coordinates: [0, 0] } }]);
  } });
  const expected = { lat: 35.65, lon: 139.75, source: 'gsi', precision: 'block', title: 'テスト住所' };
  const first = await tools.gsiGeocode({ q: fixtures[1].address });
  assert.deepEqual(first, expected); first.lat = 0;
  assert.deepEqual(await tools.gsiGeocode({ q: fixtures[1].address }), expected);
  assert.equal(calls, 1); assert.equal(typeof tools.tools.gsiGeocode.execute, 'function');
});

test('GSI LRU evicts the oldest of 500 entries and refreshes recently used entries', async () => {
  let calls = 0;
  const tools = createTools({ env, fetch: async () => { calls++; return response([]); } });
  for (let index = 0; index < 500; index++) await tools.gsiGeocode({ q: String(index) });
  await tools.gsiGeocode({ q: '0' }); await tools.gsiGeocode({ q: '500' });
  await tools.gsiGeocode({ q: '0' }); assert.equal(calls, 501);
  await tools.gsiGeocode({ q: '1' }); assert.equal(calls, 502);
});

test('lookup failures and invalid coordinates return null', async () => {
  for (const fetch of [noFetch, async () => new Response('', { status: 500 }),
    async () => response([{ geometry: { coordinates: ['139', 35] } }]), async () => response([])]) {
    assert.equal(await createTools({ env, fetch }).gsiGeocode({ q: 'test' }), null);
  }
});

test('SerpApi maps place_results and local_results, operating hours, and normalized phone matches', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'chirashi-agent-serp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let serial = 0;
  const withBudget = options => createTools({ ...options, serpapi: createSerpApi({ ...options, dir: join(dir, String(serial++)) }) });
  for (const direct of [true, false]) {
    const place = { title: '架空店', address: 'テスト区', gps_coordinates: { latitude: 35.7, longitude: 139.7 },
      rating: 4.5, reviews: 20, phone: '０１２０ ０００ １１１', operating_hours: { monday: '10–18' } };
    const tools = withBudget({ env: { ...env, SERPAPI_API_KEY: 'synthetic', SERPAPI_LIVE: '1' }, fetch: async (url, init) => {
      assert.equal(url.searchParams.get('engine'), 'google_maps'); assert.equal(url.searchParams.get('type'), 'search');
      assert.equal(url.searchParams.get('q'), '架空店'); assert.equal(url.searchParams.get('ll'), '@35.5,139.5,14z');
      assert.equal(url.searchParams.get('hl'), 'ja'); assert.ok(init.signal instanceof AbortSignal);
      return response(direct ? { place_results: place, local_results: [{ title: 'ignored' }] } : { local_results: [place] });
    } });
    const result = await tools.serpapiPlace({ name: '架空店', lat: 35.5, lon: 139.5, phones: ['0120-000-111'] });
    assert.deepEqual(result, { lat: 35.7, lon: 139.7, source: 'serpapi', precision: 'place',
      place: { title: place.title, address: place.address, rating: 4.5, reviews: 20, phone: place.phone,
        hours: place.operating_hours, phoneMatches: true } });
    assert.equal((await tools.serpapiPlace({ name: '架空店', lat: 35.5, lon: 139.5, phones: ['0120-000-222'] })).place.phoneMatches, false);
  }
  const missingPhone = withBudget({ env: { SERPAPI_API_KEY: 'synthetic', SERPAPI_LIVE: '1' }, fetch: async () => response({
    place_results: { gps_coordinates: { latitude: 35, longitude: 139 }, hours: '10–18' },
  }) });
  assert.equal((await missingPhone.serpapiPlace({ name: 'test', lat: 35, lon: 139, phones: ['bad'] })).place.phoneMatches, false);
});

test('missing SerpApi key or invalid coordinates skip fetch; no result returns null', async () => {
  const withBudget = options => createTools({ ...options, serpapi: { search: async () => { await options.fetch(); return { result: null }; } } });
  let calls = 0;
  const fetch = async () => { calls++; return response({}); };
  assert.equal(await createTools({ env, fetch }).serpapiPlace({ name: 'test', lat: 35, lon: 139 }), null);
  const tools = withBudget({ env: { SERPAPI_API_KEY: 'synthetic', SERPAPI_LIVE: '1' }, fetch });
  assert.equal(await tools.serpapiPlace({ name: 'test', lat: undefined, lon: 139 }), null); assert.equal(calls, 0);
  assert.equal(await tools.serpapiPlace({ name: 'test', lat: 35, lon: 139 }), null); assert.equal(calls, 1);
});

test('locate falls back from a failed address to a nearby business only when home is available', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'chirashi-agent-locate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const options = { env: { ...env, SERPAPI_API_KEY: 'synthetic', SERPAPI_LIVE: '1' }, fetch: async url => {
    calls.push(url.hostname);
    return response(url.hostname === 'msearch.gsi.go.jp' ? [] : { local_results: [{
      gps_coordinates: { latitude: 35.505, longitude: 139.505 }, phone: '0120-000-111',
    }] });
  } };
  const app = createApp({ ...options, serpapi: createSerpApi({ ...options, dir }) });
  assert.equal((await app.mergeFlyer(mergeInput())).location.place.phoneMatches, true);
  assert.deepEqual(calls, ['msearch.gsi.go.jp', 'serpapi.com']);
  const withoutHome = await app.mergeFlyer({ ...mergeInput(), home: null });
  assert.equal(withoutHome.location, null); assert.equal(calls.length, 2);
});

test('ranking uses the exact rules with no token, fewer than six rows, or one label', async () => {
  const expected = rulesRank({ predict });
  assert.equal(expected.model, 'rules');
  assert.ok(Math.abs(expected.scores[0].p - 0.85) < 1e-12);
  assert.ok(Math.abs(expected.scores[1].p - 0.15) < 1e-12);
  for (const [token, train] of [[undefined, []], ['synthetic', Array(5).fill({ row: predict[0].row, label: 1 })],
    ['synthetic', Array(6).fill({ row: predict[0].row, label: 1 })]]) {
    const tools = createTools({ env: { ...env, PRIOR_LABS_MCP_TOKEN: token }, fetch: noFetch });
    assert.deepEqual(await tools.rankFlyers({ train, predict }), expected);
  }
  assert.equal(rulesRank({ predict: [{ id: 'max', row: [0, 0, 0, 9, 3, 1, 0, 0, 1] }] }).scores[0].p, 1);
  assert.equal(rulesRank({ predict: [{ id: 'min', row: [0, 3, 0, 0, 0, -1, 9, 0, 0] }] }).scores[0].p, 0);
});

test('MCP discovery failure falls back to rules without leaking its error', async () => {
  const train = Array.from({ length: 6 }, (_, index) => ({ row: predict[0].row, label: index % 2 }));
  const tools = createTools({ env: { ...env, PRIOR_LABS_MCP_TOKEN: 'synthetic' }, fetch: noFetch });
  assert.deepEqual(await tools.rankFlyers({ train, predict }), rulesRank({ predict }));
});

test('rankFlyers delegates to injected TabPFN adapter', async () => {
  const train = Array.from({ length: 6 }, (_, i) => ({ row: predict[i % 2].row, label: i % 2 }));
  const expected = { model: 'tabpfn', scores: [{ id: 'trial', p: 0.9 }, { id: 'expired', p: 0.2 }] };
  const tools = createTools({ env, fetch: noFetch, tabpfn: { rank: async input => {
    assert.deepEqual(input, { train, predict }); return expected;
  } } });
  assert.deepEqual(await tools.rankFlyers({ train, predict }), expected);
});

test('the shared upstream queue caps concurrent calls at ten and releases slots on failures', async () => {
  let active = 0, peak = 0;
  await Promise.all(Array.from({ length: 20 }, () => modelCall(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
  })));
  assert.equal(peak, 10); assert.equal(active, 0);
  const queue = createCallQueue(1);
  const settled = await Promise.allSettled([queue(async () => { throw new Error('synthetic'); }), queue(async () => 42)]);
  assert.equal(settled[0].status, 'rejected'); assert.equal(settled[1].value, 42);
});

test('Sentry is conditional and registered workflow traces omit payloads before reaching the exporter', async t => {
  const plain = createApp({ env, fetch: noFetch });
  assert.equal(plain.config().features.sentry, false);
  const app = createApp({ env: { ...env, SENTRY_DSN: 'https://synthetic@example.invalid/1' }, fetch: noFetch });
  const observability = app.mastra.observability;
  t.after(() => observability.shutdown());
  const instance = observability.getDefaultInstance();
  assert.equal(instance.getConfig().serviceName, 'worth-the-walk');
  const exporters = instance.getExporters();
  assert.equal(exporters.length, 1); assert.equal(exporters[0].name, 'sentry');
  // Replace the transport-facing exporter method before any trace can be sent.
  const events = [];
  exporters[0].exportTracingEvent = async event => { events.push(event); };
  await app.readPage({ pageId: 'trace', tiles: [image] });
  await observability.flush();
  assert.ok(events.length > 0);
  assert.equal(new Set(events.map(event => event.exportedSpan.traceId)).size, 1);
  for (const { exportedSpan: span } of events) {
    assert.equal(span.input, undefined); assert.equal(span.output, undefined);
    assert.equal(span.errorInfo, undefined); assert.equal(span.requestContext, undefined);
    assert.deepEqual(span.metadata, {});
    assert.ok(Object.keys(span.attributes).every(key => key.startsWith('chirashi.') || key === 'status'));
  }
  assert.doesNotMatch(JSON.stringify(events), /data:image|無料体験|0120-000-111/);
  assert.ok(events.some(event => event.exportedSpan.attributes['chirashi.tile_count'] === 1));
  const readSpan = events.find(event => event.exportedSpan.attributes['chirashi.tile_count'] === 1).exportedSpan;
  assert.equal(exporters[0].buildSpanAttributes(readSpan)['chirashi.tile_count'], 1);
});

test('privacy processor keeps models and numeric usage while dropping content, secrets and queried URLs', () => {
  const span = privacyProcessor.process({ input: 'prompt', output: 'output', errorInfo: { message: 'secret' },
    attributes: { 'gen_ai.system': 'digitalocean', 'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'gemma', 'gen_ai.response.model': 'gemma', 'gen_ai.usage.input_tokens': 20,
      'gen_ai.usage.output_tokens': 10, model: 'gemma', usage: { inputTokens: 20, outputTokens: 10, text: 'private' },
      'gen_ai.usage.content': 'private',
      'gen_ai.input.messages': 'flyer content', 'gen_ai.output.messages': 'private', 'gen_ai.prompt': 'secret',
      'gen_ai.tool.call.arguments': '{}', 'gen_ai.tool.call.result': '{}',
      'gen_ai.tool.name': 'data:image/png;base64,AAAA', 'gen_ai.agent.name': 'x'.repeat(201),
      'gen_ai.response.finish_reasons': ['stop'], provider: 'https://example.test/?token=secret',
      'chirashi.tile_count': 1, 'chirashi.bucket': 'walk', 'chirashi.rank_model': 'rules', 'chirashi.content': 'secret' } });
  assert.equal(span.attributes['gen_ai.request.model'], 'gemma');
  assert.equal(span.attributes['gen_ai.usage.input_tokens'], 20);
  assert.equal(span.attributes['gen_ai.usage.output_tokens'], 10);
  assert.deepEqual(span.attributes.usage, { inputTokens: 20, outputTokens: 10 });
  assert.deepEqual(span.attributes['gen_ai.response.finish_reasons'], ['stop']);
  assert.equal(span.attributes['chirashi.bucket'], 'walk');
  assert.doesNotMatch(JSON.stringify(span), /prompt|output.messages|private|secret|data:|token=|call.arguments/);
});

test('automatic lookups reject address matches over 5 km from home; typed addresses are trusted', async () => {
  let searches = 0;
  // A partial printed address resolved ~6.7 km from the home station (mergeInput's home is 35.5, 139.5).
  const far = response => () => response([{ geometry: { coordinates: [139.5, 35.56] }, properties: { title: 'far block' } }]);
  const app = createApp({ env: { ...env, SERPAPI_API_KEY: 'synthetic' }, fetch: async () => far(response)(),
    serpapi: { search: async () => { searches++; return { result: null }; } } });
  assert.equal((await app.mergeFlyer(mergeInput())).location, null);
  assert.ok(searches >= 1, 'a rejected address falls back to the name search');
  const typed = await app.locate({ q: '東京都テスト区1-2-3', lat: 35.5, lon: 139.5 });
  assert.equal(typed.source, 'gsi', 'an address the user typed is never second-guessed');
  const near = createApp({ env, fetch: async () => response([{ geometry: { coordinates: [139.505, 35.505] }, properties: { title: 'near block' } }]) });
  assert.equal((await near.mergeFlyer(mergeInput())).location.source, 'gsi');
});

test('walk-only SerpApi gate skips home, keep, toss and usable GSI results', async () => {
  let searches = 0;
  const app = createApp({ env: { ...env, SERPAPI_API_KEY: 'synthetic' },
    fetch: async () => response([{ geometry: { coordinates: [139.51, 35.51] } }]),
    serpapi: { search: async () => { searches++; return { result: null }; } } });
  for (const index of [3, 4, 5]) await app.mergeFlyer(mergeInput([fixtures[index]]));
  await app.mergeFlyer(mergeInput());
  assert.equal(searches, 0);
  await app.locate({ name: 'Explicit business', lat: 35, lon: 139 });
  assert.equal(searches, 1);
});

function request(server, path, { method = 'GET', body, headers = {}, chunks } = {}) {
  const payload = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolveResponse, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: {
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }), ...headers,
    } }, res => {
      let text = '';
      res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; }); res.on('error', reject);
      res.on('end', () => resolveResponse({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    if (chunks) for (const chunk of chunks) req.write(chunk);
    else if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function startServer(t, options = {}) {
  const server = createServer({ env, fetch: noFetch, log: () => {}, ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.ok(server.listening); return server;
}

test('HTTP config, NDJSON, merge, locate, rank, and static serving work on an ephemeral port', async t => {
  const server = await startServer(t);
  const config = await request(server, '/api/config'); assert.equal(config.status, 200);
  assert.equal(JSON.parse(config.text).mode, 'mock');
  const read = await request(server, '/api/read-page', { method: 'POST', body: { pageId: 'http', tiles: [image, image] } });
  assert.equal(read.status, 200); assert.equal(read.headers['content-type'], 'application/x-ndjson');
  assert.ok(read.text.endsWith('\n'));
  const events = read.text.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ['tile', 'tile', 'done']);
  assert.deepEqual(events.at(-1).tiles, fixtures.slice(0, 2).map(normalizeTile));
  const merge = await request(server, '/api/merge', { method: 'POST', body: mergeInput() });
  assert.equal(merge.status, 200); assert.equal(JSON.parse(merge.text).flyer.bucket, 'walk');
  const keep = await request(server, '/api/merge', { method: 'POST', body: mergeInput([fixtures[5]]) });
  assert.deepEqual(Object.keys(JSON.parse(keep.text).flyer).sort(), ['bucket', 'category', 'id', 'pageIds']);
  const locate = await request(server, '/api/locate?q=test'); assert.equal(locate.status, 200);
  assert.deepEqual(JSON.parse(locate.text), { location: null });
  const rank = await request(server, '/api/rank', { method: 'POST', body: { train: [], predict } });
  assert.equal(rank.status, 200); assert.deepEqual(JSON.parse(rank.text), rulesRank({ predict }));
  const index = await request(server, '/'); assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /text\/html/);
  assert.equal((await request(server, '/api/rank')).status, 405);
  assert.equal((await request(server, '/api/unknown')).status, 404);
  assert.equal((await request(server, '/%2e%2e%5cpackage.json')).status, 403);
  assert.equal((await request(server, '/%broken')).status, 404);
});

test('HTTP rejects non-image URLs, invalid base64, too many tiles, invalid feature rows and malformed JSON', async t => {
  const server = await startServer(t);
  for (const tiles of [['data:text/plain;base64,AAAA'], ['data:image/svg+xml;base64,AAAA'],
    ['data:image/png;base64,???'], ['data:image/png;base64,A'], ['data:image/png;base64,'],
    [], Array(10).fill(image), ['data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024)]]) {
    assert.equal((await request(server, '/api/read-page', { method: 'POST', body: { pageId: 'bad', tiles } })).status, 400);
  }
  assert.equal((await request(server, '/api/read-page', { method: 'POST', body: '{bad' })).status, 400);
  for (const body of [{pageId:'bad',tiles:[image,image],mode:'page'},{pageId:'bad',tiles:[image],mode:'unknown'}]) {
    assert.equal((await request(server,'/api/read-page',{method:'POST',body})).status,400);
  }
  for (const row of [[0], Array(FEATURES.length).fill('0')]) {
    assert.equal((await request(server, '/api/rank', { method: 'POST', body: { train: [], predict: [{ id: 'bad', row }] } })).status, 400);
  }
  assert.equal((await request(server, '/api/locate?lat=NaN&lon=139')).status, 400);
});

test('HTTP enforces all three body limits including chunked requests', async t => {
  const server = await startServer(t);
  for (const [path, bytes] of [['/api/read-page', 12 * 1024 * 1024], ['/api/merge', 1024 * 1024], ['/api/rank', 256 * 1024]]) {
    const result = await request(server, path, { method: 'POST', body: ' '.repeat(bytes + 1) });
    assert.equal(result.status, 413); assert.equal(JSON.parse(result.text).error, 'Request body too large');
  }
  const chunked = await request(server, '/api/rank', { method: 'POST', chunks: [' '.repeat(200 * 1024), ' '.repeat(100 * 1024)] });
  assert.equal(chunked.status, 413);
});

test('HTTP rejects tile 241 and spoofed forwarding headers, and resets after one hour', async t => {
  let time = 1_000_000;
  const server = await startServer(t, { now: () => time });
  const send = (tiles, ip = '192.0.2.1, 192.0.2.2') => request(server, '/api/read-page', {
    method: 'POST', headers: { 'x-forwarded-for': ip }, body: { pageId: 'rate', tiles: Array(tiles).fill(image) },
  });
  for (let index = 0; index < 26; index++) assert.equal((await send(9)).status, 200);
  assert.equal((await send(6)).status, 200);
  const limited = await send(1, '192.0.2.1, 192.0.2.9'); assert.equal(limited.status, 429);
  assert.equal(JSON.parse(limited.text).retryAfter, 3600); assert.equal(limited.headers['retry-after'], '3600');
  assert.equal((await send(1, '192.0.2.2')).status, 429);
  time += 3_600_000; assert.equal((await send(1)).status, 200);
});

test('HTTP whole-page mode consumes exactly one of the shared 240 tile reads', async t => {
  const server=await startServer(t);
  const send=(count,mode='tiles')=>request(server,'/api/read-page',{method:'POST',body:{pageId:'rate',tiles:Array(count).fill(image),mode}});
  for(let i=0;i<26;i++) assert.equal((await send(9)).status,200);
  const page=await send(1,'page');assert.equal(page.status,200);
  assert.deepEqual(JSON.parse(page.text.trim().split('\n').at(-1)).tiles,[normalizeTile(fixtures[0])]);
  assert.equal((await send(5)).status,200);
  assert.equal((await send(1,'page')).status,429);
});

test('mock merge carries detail metadata through schema and replaces inaccurate whole-page prices', async () => {
  const whole=structuredClone(fixtures[2]);whole.items[0].price_yen=999;
  whole.items.push({name_ja:'架空誤読品',price_yen:888});
  const app=createApp({env});
  const merged=await app.mergeFlyer({...mergeInput(),pages:[{id:'price-page',detailed:true,tiles:[whole,...Array(6).fill(fixtures[2])]}]});
  assert.equal(merged.business.name,whole.business.name);assert.deepEqual(merged.phones,whole.phones);
  assert.equal(merged.address,whole.address);assert.equal(merged.items.length,3);
  assert.equal(merged.items[0].price_yen,158);assert.equal(merged.items[0].price_tax_incl_yen,171);
});

test('TRUST_PROXY uses the last forwarded entry, ignoring spoofed earlier entries', async t => {
  const server = await startServer(t, { env: { ...env, TRUST_PROXY: '1' } });
  const send = ip => request(server, '/api/locate?name=test', { headers: { 'x-forwarded-for': ip } });
  for (let i = 0; i < 30; i++) assert.equal((await send(`192.0.2.${i}, 198.51.100.1`)).status, 200);
  assert.equal((await send('203.0.113.1, 198.51.100.1')).status, 429);
  assert.equal((await send('198.51.100.1, 198.51.100.2')).status, 200);
});

test('merge, locate and rank have separate per-IP hourly budgets with retryAfter', async t => {
  let time = 1_000_000;
  const base = createApp({ env });
  const app = { ...base, mergeFlyer: async () => ({}), rank: async () => ({ model: 'rules', scores: [] }), locate: async () => null };
  const server = await startServer(t, { app, now: () => time });
  for (const [path, limit, body] of [['/api/merge', 60, mergeInput()], ['/api/locate?name=test', 30, undefined], ['/api/rank', 30, { train: [], predict: [] }]]) {
    const send = i => request(server, path, { method: body ? 'POST' : 'GET', body, headers: { 'x-forwarded-for': `192.0.2.${i}` } });
    for (let i = 0; i < limit; i++) assert.equal((await send(i)).status, 200);
    const blocked = await send(200);
    assert.equal(blocked.status, 429); assert.equal(JSON.parse(blocked.text).retryAfter, 3600);
    assert.equal(blocked.headers['retry-after'], '3600');
    time += 3600000; assert.equal((await send(0)).status, 200);
  }
});

test('NDJSON delivers a completed tile before the final result exists', async t => {
  const app = createApp({ env, fetch: noFetch });
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  app.readPage = async (input, onEvent) => {
    await onEvent({ type: 'tile', index: 0, tile: normalizeTile(fixtures[0]) });
    await gate;
    await onEvent({ type: 'done', pageId: input.pageId, tiles: [normalizeTile(fixtures[0])] });
  };
  const server = await startServer(t, { app });
  const body = JSON.stringify({ pageId: 'stream', tiles: [image] });
  const lines = [];
  await new Promise((resolveStream, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/read-page',
      method: 'POST', headers: { 'Content-Length': Buffer.byteLength(body) } }, res => {
      let pending = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        pending += chunk;
        while (pending.includes('\n')) {
          const end = pending.indexOf('\n'); lines.push(JSON.parse(pending.slice(0, end))); pending = pending.slice(end + 1);
          if (lines.length === 1) { assert.equal(lines[0].type, 'tile'); finish(); }
        }
      });
      res.on('end', resolveStream); res.on('error', reject);
    });
    req.on('error', reject); req.end(body);
  });
  assert.deepEqual(lines.map(line => line.type), ['tile', 'done']);
});

test('hedged requests answer from a backup when the first is slow and abort the loser', async () => {
  const wait = (ms, signal, value) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); });
  });
  let calls = 0; const signals = [];
  const slowThenFast = signal => { signals.push(signal); return wait(++calls === 1 ? 1000 : 10, signal, `answer ${calls}`); };
  assert.equal(await hedged(slowThenFast, { after: 20 }), 'answer 2');
  assert.equal(calls, 2); assert.ok(signals.every(signal => signal.aborted), 'both attempts are cleaned up');
  calls = 0;
  assert.equal(await hedged(signal => { calls++; return wait(5, signal, 'quick'); }, { after: 50 }), 'quick');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(calls, 1, 'no backup when the first attempt is fast');
  await assert.rejects(hedged(() => Promise.reject(new Error('boom')), { after: 10 }), /boom/);
});
