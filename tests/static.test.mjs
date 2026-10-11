import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
import {runInNewContext} from 'node:vm';
import {createServer} from '../scripts/serve.mjs';

let server;
before(async () => {
  server=createServer({app:{config:() => ({mode:'mock',features:{}}),serpapi:{status:async () => ({enabled:false})}},log:() => {}});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
});
after(async () => { const closed=once(server,'close'); server.close(); await closed; });
function request(path,headers={},method='GET') {
  return new Promise((resolve,reject) => {
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,headers,method},res => {
      const chunks=[]; res.on('data',chunk => chunks.push(chunk));
      res.on('end',() => resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });
    req.on('error',reject); req.end();
  });
}

test('static text negotiates br/gzip, decodes byte-for-byte and varies by encoding',async () => {
  for (const file of ['index.html','chirashi.mjs','theme.js','chirashi.css','station-coordinates.json','favicon.svg']) {
    const original=await readFile('dist/'+file);
    for (const encoding of ['gzip','br']) {
      const result=await request('/'+file,{'Accept-Encoding':encoding});
      assert.equal(result.status,200); assert.equal(result.headers['content-encoding'],encoding);
      assert.equal(result.headers.vary,'Accept-Encoding'); assert.equal(result.headers['cache-control'],'no-cache');
      assert.deepEqual(encoding === 'br' ? brotliDecompressSync(result.body) : gunzipSync(result.body),original);
      assert.deepEqual((await request('/'+file,{'Accept-Encoding':encoding})).body,result.body,'cached representation is stable');
    }
  }
  assert.equal((await request('/',{'Accept-Encoding':'gzip, br'})).headers['content-encoding'],'br');
  assert.equal((await request('/',{'Accept-Encoding':'br;q=0, gzip;q=0.8'})).headers['content-encoding'],'gzip');
  assert.equal((await request('/',{'Accept-Encoding':'br;q=0, gzip;q=0, *;q=1'})).headers['content-encoding'],undefined);
  const plain=await request('/');
  assert.equal(plain.headers['content-encoding'],undefined); assert.equal(plain.headers.vary,'Accept-Encoding');
  assert.deepEqual(plain.body,await readFile('dist/index.html'));
});

test('font subsets stay uncompressed and immutable',async () => {
  const path='/fonts/zen-kaku-gothic-new-latin-400-normal.woff2';
  const result=await request(path,{'Accept-Encoding':'br, gzip'});
  assert.equal(result.status,200); assert.equal(result.headers['content-encoding'],undefined);
  assert.equal(result.headers['cache-control'],'public, max-age=31536000, immutable');
  assert.deepEqual(result.body,await readFile('dist'+path));
});

test('install assets have the expected content types and revalidation policy',async () => {
  for (const [path,type,policy] of [
    ['/manifest.webmanifest','application/manifest+json','no-cache'],
    ['/sw.js','text/javascript; charset=utf-8','no-cache'],
    ['/icons/icon-192.png','image/png','public, max-age=86400']
  ]) {
    const result=await request(path,{'Accept-Encoding':'br, gzip'});
    assert.equal(result.status,200); assert.equal(result.headers['content-type'],type);
    assert.equal(result.headers['cache-control'],policy);
    if (path.endsWith('.png')) assert.equal(result.headers['content-encoding'],undefined);
    else assert.equal(result.headers['content-encoding'],'br');
    const head=await request(path,{},'HEAD'); assert.equal(head.status,200);
    assert.equal(head.headers['content-type'],type); assert.equal(head.headers['cache-control'],policy);
    const revalidated=await request(path,{'If-None-Match':result.headers.etag});
    assert.equal(revalidated.status,304); assert.equal(revalidated.headers['cache-control'],policy);
  }
});

test('service worker precaches startup dependencies and keeps APIs/photos off its cache',async () => {
  const origin=`http://127.0.0.1:${server.address().port}`, handlers=new Map(), stores=new Map();
  let offline=false, claimed=false, skipped=false, networkCalls=0, networkResponse;
  const absolute=input => new URL(typeof input === 'string' ? input : input.url,origin).href;
  const network=async input => {
    networkCalls++;
    if (offline) throw new Error('Offline');
    return networkResponse ? networkResponse.clone() : fetch(absolute(input));
  };
  const caches={
    keys:async () => [...stores.keys()], delete:async name => stores.delete(name),
    open:async name => {
      if (!stores.has(name)) {
        const entries=new Map();
        stores.set(name,{
          put:async (input,response) => entries.set(absolute(input),response.clone()),
          match:async (input,{ignoreSearch=false}={}) => {
            const target=new URL(absolute(input)); if (ignoreSearch) target.search='';
            for (const [url,response] of entries) {
              const candidate=new URL(url); if (ignoreSearch) candidate.search='';
              if (candidate.href === target.href) return response.clone();
            }
          },
          addAll:async inputs => {
            for (const input of inputs) {
              const response=await network(input); assert.equal(response.status,200,absolute(input));
              entries.set(absolute(input),response.clone());
            }
          }
        });
      }
      return stores.get(name);
    }
  };
  await caches.open('wtw-old');
  runInNewContext(await readFile('dist/sw.js','utf8'),{
    self:{location:{origin},addEventListener:(type,handler) => handlers.set(type,handler),
      skipWaiting:async () => { skipped=true; },clients:{claim:async () => { claimed=true; }}},
    caches,URL,Request:class extends Request { constructor(input,options) { super(absolute(input),options); } },fetch:network
  });
  async function lifecycle(type) { let done; handlers.get(type)({waitUntil:promise => { done=promise; }}); await done; }
  await lifecycle('install'); assert.ok(skipped);
  await lifecycle('activate'); assert.ok(claimed); assert.equal(stores.size,1); assert.ok(!stores.has('wtw-old'));
  const cache=await caches.open((await caches.keys())[0]);
  // Follow actual module imports, including catalog's transitive data modules.
  const checked=new Set();
  async function checkModule(path) {
    if (checked.has(path)) return; checked.add(path);
    const response=await cache.match(path); assert.ok(response,`${path} must be precached`);
    const source=await response.text();
    for (const match of source.matchAll(/\bimport\s+[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)) {
      await checkModule(new URL(match[1],origin+path).pathname);
    }
  }
  await checkModule('/chirashi.mjs');
  assert.ok(await cache.match('/station-coordinates.json'));
  function intercepted(path,{method='GET',mode='cors'}={}) {
    let response;
    handlers.get('fetch')({request:{url:absolute(path),method,mode},respondWith:value => { response=value; }});
    return response;
  }
  for (const [path,options] of [['/api/config',{}],['/api/read-page',{method:'POST'}],['/chirashi.mjs',{method:'POST'}],
    ['/photos/private.jpg',{}],['https://maps.google.com/',{mode:'navigate'}]]) {
    assert.equal(intercepted(path,options),undefined,`${path} must bypass the worker`);
  }
  networkResponse=new Response('fresh module');
  assert.equal(await (await intercepted('/chirashi.mjs')).text(),'fresh module','shell is network first even with a cache hit');
  assert.equal(await (await cache.match('/chirashi.mjs')).text(),'fresh module');
  networkResponse=new Response('server failure',{status:503});
  assert.equal((await intercepted('/chirashi.mjs')).status,503);
  assert.equal(await (await cache.match('/chirashi.mjs')).text(),'fresh module','non-200 must not replace a cached success');
  networkResponse=undefined; offline=true;
  assert.equal(await (await intercepted('/chirashi.mjs')).text(),'fresh module','shell falls back when the network fails');
  assert.deepEqual(Buffer.from(await (await intercepted('/?resume=1',{mode:'navigate'})).arrayBuffer()),await readFile('dist/index.html'));
  offline=false; networkResponse=new Response('font bytes');
  const font='/fonts/offline-policy-fixture.woff2';
  assert.equal(await (await intercepted(font)).text(),'font bytes');
  const before=networkCalls; offline=true;
  assert.equal(await (await intercepted(font)).text(),'font bytes'); assert.equal(networkCalls,before,'font hit avoids the network');
});

test('weak static ETags revalidate GET/HEAD across encodings without a body',async () => {
  for (const path of ['/chirashi.css','/fonts/dela-gothic-one-latin-400-normal.woff2']) {
    const initial=await request(path,{'Accept-Encoding':'gzip'});
    assert.match(initial.headers.etag,/^W\/"\d+-[\d.]+"$/);
    for (const method of ['GET','HEAD']) {
      const result=await request(path,{'Accept-Encoding':'br','If-None-Match':`"other", ${initial.headers.etag}`},method);
      assert.equal(result.status,304); assert.equal(result.body.length,0); assert.equal(result.headers.etag,initial.headers.etag);
    }
    const head=await request(path,{'Accept-Encoding':'gzip'},'HEAD');
    assert.equal(head.status,200); assert.equal(head.body.length,0);
    assert.equal(head.headers['content-length'],initial.headers['content-length']);
  }
  assert.equal((await request('/',{'If-None-Match':'W/"different"'})).status,200);
  assert.equal((await request('/',{'If-None-Match':'*'})).status,304);
});

test('API JSON retains no-store, no compression, no static ETag and no Vary',async () => {
  const result=await request('/api/config',{'Accept-Encoding':'br, gzip','If-None-Match':'*'});
  assert.equal(result.status,200); assert.equal(result.headers['cache-control'],'no-store');
  assert.equal(result.headers['content-encoding'],undefined); assert.equal(result.headers.etag,undefined);
  assert.equal(result.headers.vary,undefined);
  assert.deepEqual(JSON.parse(result.body),{mode:'mock',features:{serpapi:{enabled:false}}});
});
