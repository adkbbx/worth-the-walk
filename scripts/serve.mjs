import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../agent/env.mjs';
import { createApp } from '../agent/mastra.mjs';
import { readPageSchema, mergeSchema, rankSchema, locateSchema } from '../agent/schemas.mjs';

loadEnv();
const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const limits = { '/api/read-page': 12 * 1024 * 1024, '/api/merge': 1024 * 1024, '/api/rank': 256 * 1024 };

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    return Promise.reject(httpError(413, 'Request body too large'));
  }
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let bytes = 0;
    function cleanup() {
      req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', aborted);
    }
    function data(chunk) {
      bytes += chunk.length;
      if (bytes > limit) {
        cleanup(); req.resume(); reject(httpError(413, 'Request body too large'));
      } else chunks.push(chunk);
    }
    function end() {
      cleanup();
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'Invalid JSON body')); }
    }
    function aborted() { cleanup(); reject(httpError(400, 'Request interrupted')); }
    req.on('data', data); req.on('end', end); req.on('aborted', aborted); req.on('error', aborted);
  });
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw httpError(400, 'Invalid request');
  return result.data;
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

async function writeEvent(res, event) {
  if (res.destroyed || res.writableEnded) return;
  if (res.write(JSON.stringify(event) + '\n')) return;
  await new Promise(resolveDrain => {
    const done = () => { res.off('drain', done); res.off('close', done); resolveDrain(); };
    res.once('drain', done); res.once('close', done);
  });
}

export function createServer({ app, fetch, env = process.env, log = console.log, now = Date.now } = {}) {
  app ??= createApp({ fetch, env });
  const reads = new Map();
  const hour = 60 * 60 * 1000;
  function reserve(req, count, kind = 'tiles', limit = 240) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (env.TRUST_PROXY === '1' ? (Array.isArray(forwarded) ? forwarded.join(',') : forwarded)?.split(',').at(-1).trim() : null) || req.socket.remoteAddress;
    const key = `${kind}:${ip}`;
    const time = now();
    const recent = (reads.get(key) ?? []).filter(at => at > time - hour);
    if (recent.length + count > limit) {
      const retryAfter = Math.max(1, Math.ceil((recent[recent.length + count - limit - 1] + hour - time) / 1000));
      throw Object.assign(httpError(429, `${kind} limit reached`), { retryAfter });
    }
    reads.set(key, [...recent, ...Array(count).fill(time)]);
  }
  const cleanup = setInterval(() => {
    const cutoff = now() - hour;
    for (const [ip, times] of reads) if (times.at(-1) <= cutoff) reads.delete(ip);
  }, 60_000).unref();

  const server = http.createServer(async (req, res) => {
    const start = performance.now();
    let pathname = '/';
    res.on('finish', () => log(`${req.method} ${pathname} ${res.statusCode} ${Math.round(performance.now() - start)}ms`));
    try {
      const url = new URL(req.url, 'http://localhost');
      pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        if (req.method === 'GET' && pathname === '/api/config') {
          const config = app.config();
          config.features.serpapi = await app.serpapi.status();
          json(res, 200, config); return;
        }
        if (req.method === 'POST' && pathname === '/api/read-page') {
          const body = parse(readPageSchema, await readBody(req, limits[pathname]));
          // The schema requires exactly one image for a whole-page read.
          reserve(req, body.mode === 'page' ? 1 : body.tiles.length);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          res.flushHeaders();
          // Serialize complete lines even when multiple tile callbacks finish together.
          let writes = Promise.resolve();
          await app.readPage(body, event => { writes = writes.then(() => writeEvent(res, event)); return writes; });
          await writes;
          res.end(); return;
        }
        if (req.method === 'POST' && pathname === '/api/merge') {
          const body = parse(mergeSchema, await readBody(req, limits[pathname]));
          reserve(req, 1, 'merge', 60);
          json(res, 200, { flyer: await app.mergeFlyer(body) }); return;
        }
        if (req.method === 'GET' && pathname === '/api/locate') {
          const params = url.searchParams;
          const body = parse(locateSchema, { q: params.get('q') ?? undefined, name: params.get('name') ?? undefined,
            phones: params.getAll('phone'), lat: params.has('lat') ? Number(params.get('lat')) : undefined,
            lon: params.has('lon') ? Number(params.get('lon')) : undefined });
          reserve(req, 1, 'locate', 30);
          json(res, 200, { location: await app.locate(body) }); return;
        }
        if (req.method === 'POST' && pathname === '/api/rank') {
          const body = parse(rankSchema, await readBody(req, limits[pathname]));
          reserve(req, 1, 'rank', 30);
          json(res, 200, await app.rank(body)); return;
        }
        if (['/api/config', '/api/read-page', '/api/merge', '/api/locate', '/api/rank'].includes(pathname)) {
          json(res, 405, { error: 'Method not allowed' }); return;
        }
        json(res, 404, { error: 'Not found' }); return;
      }
      let path;
      try { path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); }
      catch { res.writeHead(404).end('Not found'); return; }
      if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try {
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
      } catch { res.writeHead(404).end('Not found'); }
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status ?? 500;
      json(res, status, { error: status === 500 ? 'Request failed' : error.message,
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) },
      error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    }
  });
  server.on('close', () => {
    clearInterval(cleanup);
    const observability = app.mastra?.observability;
    if (observability) void observability.flush().then(() => observability.shutdown()).catch(() => {});
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--mock')) process.env.MOCK_GEMMA = '1';
  const app = createApp();
  const budgetStatus = await app.serpapi.status();
  if (budgetStatus.enabled && budgetStatus.live) await app.serpapi.reconcile();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT ?? 4175);
  const server = createServer({ app });
  server.listen(port, host, () => {
    const { mode, model } = app.config();
    console.log(`Worth the Walk? on http://${host}:${server.address().port} · mode ${mode} · model ${model}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
