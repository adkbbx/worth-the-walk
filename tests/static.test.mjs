import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
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
