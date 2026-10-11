import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {stations,stationsOnLine} from '../data/catalog.mjs';
import {printedValue,savings} from '../src/mailbox.mjs';

const base = 'http://127.0.0.1:4180';
const key = 'worth-the-walk-v1';
let server, browser, serverError, logs = '';
const errors = [], reads = [], merges = [], ranks = [];
const readState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),key);
const pendingPhotos = page => page.evaluate(() => new Promise((resolve,reject) => {
  const request=indexedDB.open('worth-the-walk-photos',1);
  request.onerror=() => reject(request.error);
  request.onsuccess=() => {
    const db=request.result, transaction=db.transaction('pages','readonly'), rows=transaction.objectStore('pages').getAll();
    transaction.oncomplete=() => { db.close(); resolve(rows.result.map(p => ({pageId:p.pageId,type:p.blob?.type,size:p.blob?.size,rotation:p.rotation,status:p.status}))); };
    transaction.onerror=() => { db.close(); reject(transaction.error); };
  };
}));
async function inViewport(locator,label) {
  assert.ok(await locator.evaluate(el => {
    const box=el.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
  }),`${label}: outside viewport`);
}
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
    try { if (logs.includes('Worth the Walk? on '+base) && (await fetch(base+'/api/config')).ok) return; } catch {}
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
    if (index === 2) await new Promise(resolve => setTimeout(resolve,1500));
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
  await page.waitForFunction(() => document.querySelectorAll('.cw-photo').length === 3 && !document.querySelector('[data-action=read]').disabled,null,{timeout:90000});
  assert.equal(await page.locator('.cw-photo').count(),3);
  await page.getByRole('button',{name:'Rotate page 1'}).click();
  await page.waitForFunction(() => document.querySelector('.cw-photo').dataset.rotation === '90' && !document.querySelector('[data-action=read]').disabled,null,{timeout:90000});
  await page.waitForFunction(() => document.querySelector('.cw-photo img').naturalWidth > 0);
  assert.equal(await page.locator('.cw-photo').first().getAttribute('data-rotation'),'90');
  assert.ok(await page.locator('.cw-photo img').first().evaluate(img => img.naturalWidth > img.naturalHeight),'rotation is baked into the prepared preview');
  const selected=await pendingPhotos(page);
  assert.equal(selected.length,3);
  assert.ok(selected.every(p => p.type === 'image/jpeg' && p.size > 0),'prepared JPEGs stored before reading');
  await page.getByRole('button',{name:'Read 3 pages',exact:true}).click();
  await page.getByRole('heading',{name:'Reading your mailbox',exact:true}).waitFor();
  await inViewport(page.locator('#reading-heading'),'reading heading');
  assert.ok(await page.locator('#reading-card').evaluate(el => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < innerHeight));
  assert.equal(await page.locator('progress').count(),1);
  await page.waitForFunction(() => document.querySelector('progress')?.value > 0);
  await page.locator('[data-flyer]').first().waitFor();
  assert.ok(Object.values((await readState(page)).pages).length < 3,'a flyer card appears before the delayed last page finishes');
  assert.ok(await page.locator('[data-flyer]').first().isVisible());
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).flyers.length === 3,key);
  await page.locator('#reading-card').waitFor({state:'detached'});
  assert.equal(await page.locator('[data-bucket]').count(),4);
  assert.match(await page.locator('#mailbox-stat').textContent(),/3 flyers sorted → 2 outings, 1 deal, 0 safe to throw away/);
  assert.equal(await page.locator('#progress').textContent(),'');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#panel h1')),true);
  assert.equal(await page.locator('[data-bucket=toss]').getAttribute('open'),null);
  assert.ok(await page.evaluate(() => window.readProgress.some(p => /Read page \d\. \d of 3 pages read\./.test(p))),'polite announcements happen per page');
  assert.deepEqual(await pendingPhotos(page),[],'completed page blobs deleted');
  await page.locator('#photos-input').setInputFiles(files);
  await page.getByRole('button',{name:'Read 3 pages',exact:true}).click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).flyers.length === 6,key);
  await page.locator('#reading-card').waitFor({state:'detached'});
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
  // Exercise the real-phone batch and recovery separately from the six-fixture assertions above.
  const phoneContext=await browser.newContext({viewport:{width:390,height:844}});
  const phone=await phoneContext.newPage(); phone.on('pageerror',error => errors.push(error.message));
  await phone.goto(base); await phone.getByText('Demo mode',{exact:true}).waitFor();
  await phone.locator('#setup-line').selectOption('skytree');
  await phone.locator('#setup-station').selectOption(firstStation.id);
  await phone.getByRole('button',{name:'Save',exact:true}).click();
  const sevenFiles=Array.from({length:7},(_,i) => ({...files[i%files.length],name:`phone-page-${i+1}.png`}));
  await phone.locator('#photos-input').setInputFiles(sevenFiles);
  await phone.getByRole('button',{name:'Read 7 pages',exact:true}).waitFor();
  await phone.waitForFunction(() => !document.querySelector('[data-action=read]').disabled);
  await phone.evaluate(() => scrollTo(0,0));
  await inViewport(phone.getByRole('button',{name:'Read 7 pages',exact:true}),'sticky Read 7 pages');
  assert.equal(await phone.locator('.cw-photos').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
  const pageIds=await phone.locator('.cw-photo [data-action=rotate]').evaluateAll(buttons => buttons.map(b => b.dataset.id));
  let inFlight=0,maxInFlight=0,blockReads=false,aborted=0;
  const completed=new Set();
  await phone.route('**/api/read-page',async route => {
    const request=route.request().postDataJSON();
    if (blockReads) {
      aborted++;
      await new Promise(resolve => setTimeout(resolve,500));
      await route.abort('failed').catch(() => {}); // A navigation may already have cancelled it.
      return;
    }
    inFlight++; maxInFlight=Math.max(maxInFlight,inFlight);
    try {
      const index=pageIds.indexOf(request.pageId);
      await new Promise(resolve => setTimeout(resolve,index === 6 ? 1500 : 400));
      const tile=structuredClone(merges[0].pages[0].tiles[0]);
      const group=index === 6 ? 0 : index < 0 ? 10 : index;
      tile.business.name=`Phone test ${group}`; tile.phones=[`0120000${String(group).padStart(3,'0')}`]; tile.websites=[]; tile.address=null;
      const tiles=request.tiles.map(() => tile);
      await route.fulfill({status:200,contentType:'application/x-ndjson',body:tiles.map((tile,index) => JSON.stringify({type:'tile',index,tile})).join('\n')+'\n'+JSON.stringify({type:'done',pageId:request.pageId,tiles})});
      completed.add(request.pageId);
    } finally { inFlight--; }
  });
  await phone.getByRole('button',{name:'Read 7 pages',exact:true}).click();
  await phone.locator('#reading-card').waitFor();
  await inViewport(phone.locator('#reading-heading'),'seven-page reading heading');
  assert.equal(await phone.locator('#reading-progress').getAttribute('max'),'42');
  assert.equal(await phone.locator('#reading-progress').evaluate(el => el.value),0);
  assert.match(await phone.locator('#reading-time').textContent(),/Gemma is reading the first parts/);
  await phone.waitForFunction(() => document.querySelector('progress')?.value > 0);
  await phone.locator('[data-flyer]').first().waitFor();
  assert.equal(completed.has(pageIds[6]),false,'results arrive before the last page');
  await phone.waitForFunction(({key,id}) => JSON.parse(localStorage.getItem(key)).flyers.some(f => f.pageIds.includes(id)),{key,id:pageIds[0]});
  const firstCardId=(await readState(phone)).flyers.find(f => f.pageIds.includes(pageIds[0])).id;
  await phone.locator('#reading-card').waitFor({state:'detached'});
  assert.equal(maxInFlight,3,'at most three pages read concurrently');
  const phoneState=await readState(phone);
  assert.equal(Object.keys(phoneState.pages).length,7);
  assert.equal(phoneState.flyers.length,6,'later matching page replaces its previous flyer card');
  const joined=phoneState.flyers.find(f => f.pageIds.includes(pageIds[0]));
  assert.deepEqual(new Set(joined.pageIds),new Set([pageIds[0],pageIds[6]]));
  assert.equal(joined.id,firstCardId,'an expanded group keeps its flyer identity');
  assert.equal(await phone.locator(`[data-flyer="${joined.id}"]`).count(),1);
  assert.deepEqual(await pendingPhotos(phone),[]);

  // Abort every request, then reload while workers still hold the selected batch.
  blockReads=true;
  await phone.locator('#photos-input').setInputFiles(files);
  const interruptedRequest=phone.waitForRequest('**/api/read-page');
  await phone.getByRole('button',{name:'Read 3 pages',exact:true}).click();
  await phone.locator('#reading-card').waitFor();
  phone.on('dialog',dialog => dialog.accept());
  await interruptedRequest;
  await phone.reload(); await phone.getByText('Demo mode',{exact:true}).waitFor();
  await phone.getByRole('button',{name:'Resume reading',exact:true}).waitFor();
  assert.ok(aborted > 0);
  assert.match(await phone.locator('.cw-resume h2').textContent(),/3 pages waiting from/);
  assert.match(await phone.locator('.cw-resume').textContent(),/Page 1 · Page 2 · Page 3/);
  const recoveredPhotos=await pendingPhotos(phone);
  assert.equal(recoveredPhotos.length,3);
  assert.ok(recoveredPhotos.every(p => p.type === 'image/jpeg' && p.size > 0));
  blockReads=false;
  await phone.getByRole('button',{name:'Resume reading',exact:true}).click();
  await phone.locator('#reading-card').waitFor({state:'detached'});
  const resumed=await readState(phone);
  assert.ok(recoveredPhotos.every(p => resumed.pages[p.pageId]),'every pending page is read after resuming');
  assert.deepEqual(await pendingPhotos(phone),[],'no pending blobs after resume');
  assert.ok(!JSON.stringify(resumed).includes('data:image/'));
  await overflow(phone,'seven-page reading and recovery');
  await phoneContext.close();
  // Walk recovery uses fictional flyers and Tobu Skytree coordinates only.
  const walkContext=await browser.newContext({viewport:{width:390,height:844}});
  const walkPage=await walkContext.newPage(); walkPage.on('pageerror',error => errors.push(error.message));
  await walkPage.clock.setFixedTime(new Date('2026-10-13T10:30:00+09:00'));
  const walkCoordinates=JSON.parse(await readFile(new URL('../data/station-coordinates.json',import.meta.url),'utf8'));
  const remoteStation=walkCoordinates.find(s => s.id === 'kanegafuchi');
  const remoteLocation={lat:remoteStation.lat,lon:remoteStation.lon,source:'gsi'};
  await walkPage.goto(base); await walkPage.getByText('Demo mode',{exact:true}).waitFor();
  await walkPage.evaluate(({key,location}) => {
    const state=JSON.parse(localStorage.getItem(key));
    state.settings={lineId:'skytree',home:'asakusa',maxMinutes:40,weightKg:60};
    const advert=(id,name,extra={}) => ({id,pageIds:[],category:'cleaning',bucket:'walk',business:{name},summary_en:'Printed cleaning offer',offers:[{text_en:'Printed offer',discount_yen:100}],items:[],location:null,deadline:null,hours:null,...extra});
    state.flyers=[advert('unlocated','Fictional walk shop'),advert('cleaner','Cleaner <img src=x onerror=alert(1)>',{bucket:'home',offers:[],items:[{name_en:'Suit jacket',price_yen:596,conditions:[]},{name_en:'Jacket',price_yen:596,regular_yen:1193,conditions:[]}]}),
      advert('expired','Expired shop',{location,deadline:'2026-10-12'}),advert('closed','Closed shop',{location,hours:'00:00-00:01'}),advert('disliked','Disliked shop',{location})];
    state.labels={disliked:0}; state.outings=[];
    localStorage.setItem(key,JSON.stringify(state));
  },{key,location:remoteLocation});
  await walkPage.reload(); await walkPage.getByText('Demo mode',{exact:true}).waitFor();
  await walkPage.locator('[data-shopping=cleaner][data-index="0"]').check();
  await walkPage.locator('[data-shopping=cleaner][data-index="1"]').check();
  await walkPage.locator('[data-tab=walk]').click();
  const unlocated=walkPage.locator('[data-stop-choice=unlocated]');
  await unlocated.getByText('No location yet',{exact:true}).waitFor();
  assert.equal(await unlocated.getByLabel('Type the address').count(),1);
  assert.equal(await unlocated.getByRole('link',{name:'Find on Google Maps'}).getAttribute('href'),'https://www.google.com/maps/search/?api=1&query=Fictional%20walk%20shop');
  const cleaner=walkPage.locator('[data-stop-choice=cleaner]');
  assert.match(await cleaner.textContent(),/Suit jacket ¥596 · Jacket ¥596/);
  assert.equal(await cleaner.locator('img').count(),0,'model text is escaped');
  for (const [id,label] of [['expired','Expired'],['closed',"Closed when you'd arrive"],['disliked','You said 👎']]) {
    const row=walkPage.locator(`[data-stop-choice=${id}]`);
    await row.getByText(label,{exact:true}).waitFor();
    assert.equal(await row.locator('[data-stop]').isChecked(),false);
    assert.equal(await row.locator('[data-stop]').isEnabled(),true);
    assert.match(await row.getAttribute('class'),/cw-stop-warning/);
  }
  const locateQueries=[];
  await walkPage.route('**/api/locate?*',async route => {
    const query=new URL(route.request().url()).searchParams; locateQueries.push(Object.fromEntries(query));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({location:remoteLocation})});
  });
  await unlocated.getByLabel('Type the address').fill('Fictional address 1');
  await unlocated.getByRole('button',{name:'Find address',exact:true}).click();
  await walkPage.locator('.cw-plan h2').filter({hasText:'Take the train to Kanegafuchi, then walk'}).waitFor();
  assert.equal(locateQueries[0].q,'Fictional address 1');
  assert.equal(locateQueries[0].name,'Fictional walk shop');
  assert.ok(Number.isFinite(Number(locateQueries[0].lat)) && Number.isFinite(Number(locateQueries[0].lon)));
  assert.deepEqual((await readState(walkPage)).flyers.find(f => f.id === 'unlocated').location,remoteLocation);
  assert.match(await unlocated.textContent(),/km · ~\d+ min each way/);
  await cleaner.getByLabel('Type the address').fill('Fictional address 2');
  await cleaner.getByRole('button',{name:'Find address',exact:true}).click();
  await walkPage.locator('.cw-route').getByText('Suit jacket ¥596 · Jacket ¥596',{exact:true}).waitFor();
  await walkPage.getByRole('button',{name:'Plan walk',exact:true}).click();
  assert.ok((await readState(walkPage)).outings.find(o => o.status === 'planned').stopIds.includes('cleaner'),'item-only flyer is a stop');
  // Move the cleaner far enough off the rail corridor that the 40-minute route
  // drops it, but extending to 60 minutes includes both selected stops.
  await walkPage.evaluate(key => {
    const state=JSON.parse(localStorage.getItem(key)); state.flyers.find(f => f.id === 'cleaner').location.lat+=0.024;
    localStorage.setItem(key,JSON.stringify(state));
  },key);
  await walkPage.reload(); await walkPage.getByText('Demo mode',{exact:true}).waitFor();
  await walkPage.locator('[data-tab=walk]').click();
  await walkPage.getByRole('heading',{name:"Didn't fit in 40 min",exact:true}).waitFor();
  assert.match(await walkPage.locator('.cw-dropped').textContent(),/Cleaner <img/);
  await walkPage.getByRole('button',{name:'Make it 60 min',exact:true}).click();
  await walkPage.getByText('Walk re-planned for up to 60 min.',{exact:true}).waitFor();
  assert.equal((await readState(walkPage)).settings.maxMinutes,60);
  const expanded=(await readState(walkPage)).outings.find(o => o.status === 'planned');
  assert.ok(expanded.stopIds.includes('unlocated') && expanded.stopIds.includes('cleaner'));
  assert.ok(expanded.minutes<=60);
  assert.equal(await walkPage.locator('.cw-dropped').count(),0);
  await walkPage.getByRole('button',{name:'Start walk',exact:true}).click();
  await walkPage.reload(); await walkPage.getByText('Demo mode',{exact:true}).waitFor();
  await walkPage.locator('[data-tab=walk]').click();
  await walkPage.locator('[data-active-stop=cleaner]').getByText('Suit jacket ¥596 · Jacket ¥596',{exact:true}).waitFor();
  await walkPage.locator('#settings-button').click();
  await walkPage.getByLabel('90 min',{exact:true}).check();
  await walkPage.getByRole('button',{name:'Save',exact:true}).click();
  await walkPage.reload(); await walkPage.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal((await readState(walkPage)).settings.maxMinutes,90,'90-minute option survives reload');
  await overflow(walkPage,'walk location and train recovery');
  await walkContext.close();
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
  assert.equal(await freshPage.getByRole('link',{name:'← Worth the Walk?',exact:true}).getAttribute('href'),'/');
  assert.deepEqual(errors,[],'no browser page errors');
  console.log(`Chirashi browser: PASS · 6 flyers · 2 stamps · ¥${expectedYen.toLocaleString('en-US')} saved · persistence, privacy, 4 tabs, 1280px, sticky seven-page reading, incremental merge, reload recovery, walk address lookup, train starts and longer walks verified.`);
  console.log('Screenshots: .impeccable/review/chirashi-{mailbox,walk,stamps,history}.png');
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    const exited = once(server,'exit'); server.kill();
    await Promise.race([exited,new Promise(resolve => setTimeout(resolve,5000))]);
  }
}
