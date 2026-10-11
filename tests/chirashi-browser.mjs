import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {stations,stationsOnLine} from '../data/catalog.mjs';
import {printedValue,savings} from '../src/mailbox.mjs';

const base = 'http://127.0.0.1:4180';
const key = 'chirashi-walk-v1';
let server, browser, serverError, logs = '';
const errors = [], reads = [], merges = [], ranks = [];
const readState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),key);
async function overflow(page,label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`${label}: horizontal overflow`);
}
async function snapshot(page,tab) {
  await overflow(page,tab);
  await page.screenshot({path:`.impeccable/review/chirashi-${tab}.png`,fullPage:true});
}
async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Mock server exited: ${logs}`);
    try { if (logs.includes('Chirashi Walk on '+base) && (await fetch(base+'/api/config')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  throw new Error(`Mock server did not start: ${logs}`);
}
try {
  server = spawn(process.execPath,['scripts/serve.mjs','--mock'],{
    cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'4180',HOST:'127.0.0.1',MOCK_GEMMA:'1',SENTRY_DSN:''},stdio:['ignore','pipe','pipe'],windowsHide:true,
  });
  server.on('error',error => { serverError = error; });
  server.stdout.on('data',chunk => { logs += chunk; });
  server.stderr.on('data',chunk => { logs += chunk; });
  await waitForServer();
  browser = await chromium.launch({channel:process.env.TEST_BROWSER || 'msedge'});
  const context = await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation']});
  const page = await context.newPage(); page.on('pageerror',error => errors.push(error.message));
  // Opening hours and deadlines depend on the clock; a fixed Saturday morning keeps the run repeatable.
  await page.clock.setFixedTime(new Date('2026-10-17T10:30:00+09:00'));
  await page.clock.setFixedTime(new Date('2026-10-11T02:00:00Z'));
  // The server's demo returns the same six unrelated tile fixtures for EVERY page.
  // Arrange those real streamed fixtures as separate fictional page readings.
  // A second batch is necessary: three single-flyer pages cannot produce six cards.
  const fixtureOrder = [0,2,3,4,5,0];
  let fixtureIndex = 0;
  await page.route('**/api/read-page',async route => {
    const request = route.request().postDataJSON(), index = fixtureIndex++;
    reads.push(request);
    assert.equal(request.tiles.length,6,'2 × 3 or 3 × 2 tiling');
    for (const tile of request.tiles) { assert.match(tile,/^data:image\/jpeg;base64,/); assert.ok(Buffer.byteLength(tile) <= 2*1024*1024); }
    const response = await route.fetch(); assert.equal(response.status(),200);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    const tile = structuredClone(events.find(e => e.type === 'done').tiles[fixtureOrder[index]]);
    if (index === 5) { tile.business.name = '架空テスト教室'; tile.phones = ['0120-000-666']; }
    const tiles = request.tiles.map(() => tile);
    // Deliberately include CRLF and an unterminated final line.
    const body = tiles.map((tile,index) => JSON.stringify({type:'tile',index,tile})).join('\r\n')+'\r\n'+JSON.stringify({type:'done',pageId:request.pageId,tiles});
    await route.fulfill({status:200,contentType:'application/x-ndjson',body});
  });
  page.on('request',request => {
    if (request.url().endsWith('/api/merge')) merges.push(request.postDataJSON());
    if (request.url().endsWith('/api/rank')) ranks.push(request.postDataJSON());
  });
  await mkdir('.impeccable/review',{recursive:true});
  await page.goto(base); await page.getByText('Demo mode',{exact:true}).waitFor();
  assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/viewport-fit=cover/);
  assert.equal((await readState(page)).settings.home,null);
  await overflow(page,'setup');
  await page.locator('#setup-line').selectOption('skytree');
  const firstStation = stationsOnLine(stations,'skytree')[0];
  await page.locator('#setup-station').selectOption(firstStation.id);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal((await readState(page)).settings.home,firstStation.id);
  assert.equal((await readState(page)).settings.maxMinutes,40);
  const pages = await page.evaluate(() => Array.from({length:3},(_,i) => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,600,900);
    ctx.fillStyle = '#172536'; ctx.font = '36px sans-serif'; ctx.fillText(`Fictional flyer ${i+1}`,40,80);
    ctx.font = '24px sans-serif'; ctx.fillText('Printed offer for browser test',40,160);
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  const files = pages.map((base64,index) => ({name:`fictional-page-${index+1}.png`,mimeType:'image/png',buffer:Buffer.from(base64,'base64')}));
  await page.evaluate(() => {
    window.readProgress = [];
    new MutationObserver(() => window.readProgress.push(document.querySelector('#progress').textContent)).observe(document.querySelector('#progress'),{childList:true,subtree:true,characterData:true});
  });
  await page.locator('#photos-input').setInputFiles([files[0]]);
  await page.getByRole('button',{name:'Read 1 page',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove page 1',exact:true}).click();
  await page.locator('#photos-input').setInputFiles(files);
  assert.equal(await page.locator('.cw-photo').count(),3);
  await page.getByRole('button',{name:'Rotate page 1'}).click();
  assert.match(await page.locator('.cw-photo img').first().getAttribute('style'),/90deg/);
  await page.getByRole('button',{name:'Read 3 pages',exact:true}).click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).flyers.length === 3,key);
  await page.locator('[data-action=read]').waitFor({state:'detached'});
  assert.equal(await page.locator('[data-bucket]').count(),4);
  assert.match(await page.locator('#mailbox-stat').textContent(),/3 flyers sorted → 2 outings, 1 deal, 0 safe to throw away/);
  assert.equal(await page.locator('#progress').textContent(),'');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#panel h1')),true);
  assert.equal(await page.locator('[data-bucket=toss]').getAttribute('open'),null);
  assert.ok(await page.evaluate(() => window.readProgress.some(p => /Reading page \d of 3 · part \d of 6/.test(p))));
  await page.locator('#photos-input').setInputFiles(files);
  await page.getByRole('button',{name:'Read 3 pages',exact:true}).click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).flyers.length === 6,key);
  await page.locator('[data-action=read]').waitFor({state:'detached'});
  const sorted = await readState(page);
  assert.equal(reads.length,6);
  assert.equal(merges.length,6);
  const kept = sorted.flyers.find(f => f.bucket === 'keep');
  assert.deepEqual(Object.keys(kept).sort(),['bucket','category','id','pageIds']);
  assert.ok(kept.pageIds.every(id => !sorted.pages[id]),'personal mail tiles discarded');
  assert.ok(!JSON.stringify(sorted).includes('data:image/'),'no stored images');
  assert.equal(Object.values(sorted.pages).length,5);
  await page.locator('[data-bucket=toss]>summary').click();
  assert.equal(await page.locator(`[data-flyer="${kept.id}"] [data-action=rate]`).count(),0);
  for (const f of sorted.flyers.filter(f => f.bucket !== 'keep')) {
    const label = f.bucket === 'walk' ? 1 : 0;
    await page.locator(`[data-flyer="${f.id}"] [data-action=rate][data-label="${label}"]`).click();
  }
  assert.equal(ranks.length,0,'five eligible ratings do not meet the six-choice threshold');
  // A legacy personal-mail label must never count. Add a sixth advert to exercise ranking.
  await page.evaluate(({key,keptId}) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.labels[keptId] = 1;
    const extra = structuredClone(state.flyers.find(f => f.bucket === 'toss'));
    extra.id = 'ranking-test-advert'; state.flyers.push(extra); state.labels[extra.id] = 0;
    localStorage.setItem(key,JSON.stringify(state));
  },{key,keptId:kept.id});
  await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor();
  await page.getByText('based on your 6 choices (simple rules)',{exact:true}).waitFor();
  assert.ok(ranks.length >= 1);
  assert.equal(ranks.at(-1).train.length,6);
  assert.deepEqual(new Set(ranks.at(-1).train.map(t => t.label)),new Set([0,1]));
  assert.equal(ranks.at(-1).predict.some(f => f.id === kept.id),false);
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    state.flyers = state.flyers.filter(f => f.id !== 'ranking-test-advert');
    delete state.labels['ranking-test-advert']; localStorage.setItem(key,JSON.stringify(state));
  },key);
  await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor();
  await snapshot(page,'mailbox');
  await page.locator('[data-tab=walk]').click();
  assert.deepEqual(errors,[],'no page errors when opening the Walk tab');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#panel h1')),true);
  await page.getByRole('button',{name:'Plan walk',exact:true}).click();
  let planned = (await readState(page)).outings.find(o => o.status === 'planned');
  assert.ok(planned.stopIds.length >= 2,'plan has two nearby demo stops');
  assert.ok(planned.minutes <= 40);
  assert.match(await page.getByRole('link',{name:'Open walking route'}).getAttribute('href'),/travelmode=walking/);
  assert.ok(await page.locator('.cw-route .cw-stop-reason').count() > 0);
  await snapshot(page,'walk');
  await page.getByRole('button',{name:'Start walk',exact:true}).click();
  await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor();
  await page.locator('[data-tab=walk]').click();
  await page.getByRole('heading',{name:'Your walk is underway.'}).waitFor();
  assert.ok(await page.locator('[data-active-stop] .cw-stop-reason').count() > 0);
  let saved = await readState(page), outing = saved.outings.find(o => o.status === 'active');
  const first = saved.flyers.find(f => f.id === outing.stopIds[0]);
  await context.setGeolocation({latitude:first.location.lat,longitude:first.location.lon,accuracy:1});
  await page.locator(`[data-active-stop="${first.id}"] [data-action=here]`).click();
  await page.locator(`[data-active-stop="${first.id}"] .cw-stamp.gps`).waitFor();
  const second = saved.flyers.find(f => f.id === outing.stopIds[1]);
  await context.setGeolocation({latitude:second.location.lat+1000/111320,longitude:second.location.lon,accuracy:1});
  await page.locator(`[data-active-stop="${second.id}"] [data-action=here]`).click();
  await page.getByText(/keep walking/).waitFor();
  await page.locator(`[data-active-stop="${second.id}"] [data-action=stamp-anyway]`).click();
  await page.locator(`[data-active-stop="${second.id}"] .cw-stamp.self`).waitFor();
  const used = page.locator('[data-used][data-kind=offer]').first();
  // If grocery ordering put the supermarket first, the second stamped dojo still has an offer.
  assert.ok(await used.count());
  const usedId = await used.getAttribute('data-used'), usedIndex = Number(await used.getAttribute('data-index'));
  const expectedYen = printedValue(saved.flyers.find(f => f.id === usedId).offers[usedIndex]);
  assert.ok(expectedYen > 0);
  await used.check();
  assert.match(await page.locator('#walk-saved').textContent(),new RegExp(`Saved ¥${expectedYen.toLocaleString('en-US')}`));
  await page.locator('[data-tab=stamps]').click();
  await page.getByRole('heading',{name:`Walk in progress · 2 of ${outing.stopIds.length} stops stamped`,exact:true}).waitFor();
  await page.getByText('Finish a walk this week to start a streak',{exact:true}).waitFor();
  assert.equal(await page.getByText('+ 0 used without a printed value',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Continue walk',exact:true}).click();
  await page.getByRole('heading',{name:'Your walk is underway.'}).waitFor();
  await page.locator('[data-tab=stamps]').click();
  assert.equal(await page.locator('.cw-stamp').count(),2);
  await page.getByText('self-reported',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.cw-stamp').first().evaluate(el => {
    const s = getComputedStyle(el); return [s.width,s.height,s.borderTopWidth,s.color];
  }),['104px','104px','3px','rgb(181, 69, 8)']);
  assert.equal(await page.locator('.cw-stamp.self').evaluate(el => getComputedStyle(el).opacity),'0.6');
  assert.equal(await page.locator('.cw-stamp-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
  assert.equal(await page.locator('[data-metric="places stamped"] strong').textContent(),'2');
  assert.equal(await page.locator('[data-metric="yen saved"] strong').textContent(),'¥'+expectedYen.toLocaleString('en-US'));
  await snapshot(page,'stamps');
  await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal((await readState(page)).outings.find(o => o.status === 'active').stamps.length,2);
  await page.locator('[data-tab=history]').click();
  assert.equal(await page.locator('.cw-history-item').count(),7);
  assert.equal(await page.locator('.cw-history-item .cw-pill').first().evaluate(el => getComputedStyle(el).display),'inline-block');
  assert.ok((await page.locator('.cw-history-item > .cw-meta').first().textContent()).includes('1 page'));
  await snapshot(page,'history');
  await page.locator('#history-search').fill('aikido');
  assert.ok(await page.locator('.cw-history-item').count() >= 2);
  await page.locator('#history-search').fill('');
  await page.locator('.cw-history-item').first().click();
  assert.equal(await page.locator('.cw-card').count(),1);
  await overflow(page,'history flyer detail');
  await page.getByRole('button',{name:'← History',exact:true}).click();
  await page.locator('.cw-history-item').last().click();
  assert.equal(await page.locator('.cw-stamp').count(),2);
  await overflow(page,'history walk detail');
  await page.locator('[data-tab=walk]').click();
  await page.getByRole('button',{name:'Finish walk',exact:true}).click();
  assert.equal((await readState(page)).outings.find(o => o.id === outing.id).status,'done');
  assert.equal(await page.getByRole('button',{name:'Continue walk',exact:true}).count(),0);
  await page.getByText('1 week in your weekly streak',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-metric="walks done"] strong').textContent(),'1');
  assert.ok(Number(await page.locator('[data-metric="km"] strong').textContent()) > 0);
  assert.equal(savings([{entry:saved.flyers.find(f => f.id === usedId).offers[usedIndex]}]).yen,expectedYen);
  // Desktop uses the same phone-first content, without stretched text or overflow.
  await page.setViewportSize({width:1280,height:900});
  for (const name of ['mailbox','walk','stamps','history']) { await page.locator(`[data-tab=${name}]`).click(); await overflow(page,`desktop ${name}`); }
  const empty = await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation']});
  const freshPage = await empty.newPage(); freshPage.on('pageerror',error => errors.push(error.message));
  await freshPage.goto(base); await freshPage.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal((await readState(freshPage)).flyers.length,0); assert.equal((await readState(freshPage)).settings.home,null);
  assert.equal(await freshPage.locator('#setup-station').inputValue(),'');
  await overflow(freshPage,'new context');
  await freshPage.evaluate(key => localStorage.setItem(key,'{corrupt'),key);
  await freshPage.reload(); await freshPage.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal((await readState(freshPage)).flyers.length,0);
  await freshPage.goto(base+'/shops.html'); await freshPage.locator('.store').first().waitFor();
  assert.equal(await freshPage.title(),'Station Points — shops by station');
  assert.equal(await freshPage.getByRole('link',{name:'← Chirashi Walk',exact:true}).getAttribute('href'),'/');
  assert.deepEqual(errors,[],'no browser page errors');
  console.log(`Chirashi browser: PASS · 6 flyers · 2 stamps · ¥${expectedYen.toLocaleString('en-US')} saved · persistence, privacy, 4 tabs and 1280px verified.`);
  console.log('Screenshots: .impeccable/review/chirashi-{mailbox,walk,stamps,history}.png');
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    const exited = once(server,'exit'); server.kill();
    await Promise.race([exited,new Promise(resolve => setTimeout(resolve,5000))]);
  }
}
