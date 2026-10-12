import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {stations,stationsOnLine} from '../data/catalog.mjs';
import {printedValue,savings} from '../src/mailbox.mjs';

// Reviewer-run acceptance test. The sandbox does not launch Edge.
const base='http://127.0.0.1:4180', key='worth-the-walk-v1';
const clock=new Date('2026-10-11T02:00:00Z');
const fixture=JSON.parse(await readFile(new URL('./fixtures/tiles.json',import.meta.url),'utf8'));
const coordinates=JSON.parse(await readFile(new URL('../data/station-coordinates.json',import.meta.url),'utf8'));
const station=stationsOnLine(stations,'skytree')[0]; // Tobu Skytree only, never the user's home.
const homePoint=coordinates.find(s => s.id === station.id);
const errors=[], reads=[], merges=[], locates=[], ranks=[], releases=[];
const coarse = value => Number.isFinite(Number(value)) && Math.abs(Number(value)*100-Math.round(Number(value)*100))<1e-8;
const capturedScreens=new Set();
const contrastThemes=new Set();
let server,browser,serverError,logs='';
const readState=page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),key);
const active=state => state.outings.find(o => o.status === 'active');
const delay=ms => new Promise(resolve => setTimeout(resolve,ms));
function gate() { let release; const promise=new Promise(resolve => { release=resolve; }); releases.push(release); return {promise,release}; }
async function rows(page,store='pages') {
  return page.evaluate(store => new Promise((resolve,reject) => {
    const request=indexedDB.open('worth-the-walk-photos',2); request.onerror=() => reject(request.error);
    request.onsuccess=() => { const db=request.result, tx=db.transaction(store,'readonly'), result=tx.objectStore(store).getAll();
      tx.oncomplete=() => { db.close(); resolve(result.result.map(p => ({pageId:p.pageId,type:p.blob?.type,size:p.blob?.size,rotation:p.rotation}))); };
      tx.onerror=() => { db.close(); reject(tx.error); };
    };
  }),store);
}
async function copyThumbs(source,target) {
  // storageState cannot serialize Blob values; copy the retained fixture JPEGs explicitly.
  const thumbs=await source.evaluate(async () => {
    const records=await new Promise((resolve,reject) => {
      const r=indexedDB.open('worth-the-walk-photos',2); r.onerror=() => reject(r.error);
      r.onsuccess=() => { const db=r.result, tx=db.transaction('thumbs','readonly'), q=tx.objectStore('thumbs').getAll();
        tx.oncomplete=() => { db.close(); resolve(q.result); }; tx.onerror=() => { db.close(); reject(tx.error); };
      };
    });
    return Promise.all(records.map(async record => ({...record,blob:{type:record.blob.type,bytes:Array.from(new Uint8Array(await record.blob.arrayBuffer()))}})));
  });
  await target.evaluate(thumbs => new Promise((resolve,reject) => {
    const r=indexedDB.open('worth-the-walk-photos',2); r.onerror=() => reject(r.error);
    r.onsuccess=() => { const db=r.result, tx=db.transaction('thumbs','readwrite'), store=tx.objectStore('thumbs');
      for (const record of thumbs) store.put({...record,blob:new Blob([new Uint8Array(record.blob.bytes)],{type:record.blob.type})});
      tx.oncomplete=() => { db.close(); resolve(); }; tx.onerror=() => { db.close(); reject(tx.error); };
    };
  }),thumbs);
}
async function overflow(page,label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),label+': document overflow');
  for (const dialog of await page.locator('dialog[open]').all()) assert.ok(await dialog.evaluate(el => el.scrollWidth<=el.clientWidth),label+': sheet overflow');
  assert.deepEqual(await page.locator('.cw-main button, .cw-main a, dialog[open] button, dialog[open] a, select').evaluateAll(els => els.filter(el => el.getClientRects().length).filter(el => { const r=el.getBoundingClientRect(); return r.width<43.9 || r.height<43.9; }).map(el => el.textContent.trim())),[],label+': controls have 44px targets');
  for (const text of await page.locator('.cw-line-station.current b').all()) {
    assert.ok(await text.evaluate(el => { const label=el.getBoundingClientRect(),dot=el.parentElement.querySelector('.cw-line-dot').getBoundingClientRect(),board=el.closest('.cw-board').getBoundingClientRect(); return Math.abs((label.left+label.right-dot.left-dot.right)/2)<1 && label.left>=board.left && label.right<=board.right; }),label+': line label is centred on its dot and inside the board');
  }
}
async function accessibility(page,label) {
  const problems=await page.evaluate(() => {
    const visible=el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],dialog:not([open])');
    const name=el => {
      if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim();
      if (el.getAttribute('aria-labelledby')) return el.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      return Array.from(el.childNodes).map(node => node.nodeType===Node.TEXT_NODE ? node.textContent : node.matches?.('[aria-hidden=true]') ? '' : name(node)).join(' ').trim() || el.getAttribute('alt') || el.getAttribute('title') || '';
    };
    const errors=[];
    for (const el of document.querySelectorAll('button,a[href]')) if (visible(el) && !name(el)) errors.push('unnamed '+el.outerHTML);
    if (document.querySelectorAll('#panel h1').length!==1) errors.push('main view must have exactly one h1');
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      const title=document.getElementById(dialog.getAttribute('aria-labelledby'));
      if (!title || !dialog.contains(title) || !title.textContent.trim()) errors.push('dialog missing title');
      let level=1;
      for (const heading of dialog.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        const next=Number(heading.tagName.slice(1)); if (next>level+1) errors.push('skipped sheet heading'); level=next;
      }
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node=walker.currentNode, el=node.parentElement;
      if (el.closest('script,style') || !visible(el)) continue;
      if (/[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/u.test(node.textContent) && !el.closest('[lang]')?.getAttribute('lang').startsWith('ja')) errors.push('Japanese language missing: '+node.textContent);
    }
    for (const el of document.querySelectorAll('input:not([type=file]),select,textarea')) {
      if (!visible(el)) continue;
      if (!el.labels?.length && !el.getAttribute('aria-label')) errors.push('unlabelled form field');
      if (el.getAttribute('aria-invalid')==='true' && !el.getAttribute('aria-describedby')) errors.push('invalid field missing error description');
    }
    return errors;
  });
  assert.deepEqual(problems,[],label+': names, headings, language and forms');
  const originalFocus=await page.evaluateHandle(() => document.activeElement);
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => { const el=document.activeElement, s=getComputedStyle(el); return el.matches(':focus-visible') && ((s.outlineStyle!=='none' && parseFloat(s.outlineWidth)>=2) || s.boxShadow!=='none'); }),label+': Tab has a visible focus ring');
  await originalFocus.evaluate(el => { if (el.isConnected) el.focus({preventScroll:true}); }); await originalFocus.dispose();
}
async function contrast(page,theme) {
  const table=await page.evaluate(() => {
    const host=document.createElement('div'); host.setAttribute('aria-hidden','true'); host.style.cssText='position:fixed;left:-10000px;background:var(--paper)'; document.body.append(host);
    const rgb=color => color.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum=color => { const [r,g,b]=rgb(color).map(x => { x/=255; return x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; };
    const ratio=(a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const pairs=[['ink','paper'],['ink','desk'],['muted','paper'],['muted','desk'],['muted','paper-2'],['gate','paper'],['gate-ink','gate'],['sticker-ink','sticker'],['sticker-sale','sticker'],['sticker-old','sticker'],['lcd-ink','lcd'],['lcd-dim','lcd'],['sale','paper'],['ink-green','paper'],...['indigo','green','vermilion','teal'].map(ink => ['ink-'+ink,'paper',3]),['control-rule','paper',3],['control-rule','paper-2',3],['gate','desk',3],['gate','paper-2',3]];
    const table=pairs.map(([foreground,background,min=4.5]) => {
      const el=document.createElement('span'); el.style.color=`var(--${foreground})`; el.style.backgroundColor=`var(--${background})`; el.textContent='Aa'; host.append(el);
      const style=getComputedStyle(el); return {pair:foreground+'/'+background,ratio:ratio(style.color,style.backgroundColor),min};
    });
    for (const [tag,className,parentClass] of [['p','cw-print',''],['input','',''],['button','','cw-chips'],['label','','cw-radio'],['button','cw-primary','']]) {
      const parent=document.createElement('div'); parent.className=parentClass; host.append(parent);
      const el=document.createElement(tag); el.className=className; el.textContent='Aa'; parent.append(el); const style=getComputedStyle(el);
      const paper=getComputedStyle(host).backgroundColor;
      if (className==='cw-print') table.push({pair:'print label/paper',ratio:ratio(style.color,paper),min:4.5});
      else if (className==='cw-primary') {
        el.disabled=true; const disabled=getComputedStyle(el);
        table.push({pair:'disabled primary (exempt)',ratio:ratio(disabled.color,disabled.backgroundColor),min:0,opacity:Number(disabled.opacity)});
      } else table.push({pair:tag+' '+parentClass+' boundary/paper',ratio:ratio(style.borderColor,paper),min:3});
    }
    host.remove(); return table;
  });
  for (const row of table) {
    assert.ok(row.ratio>=row.min,`${theme} ${row.pair}: ${row.ratio.toFixed(2)} < ${row.min}`);
    if (row.opacity !== undefined) assert.ok(row.opacity>=.4 && row.opacity<=.7,'disabled is visibly dimmed');
  }
  if (!contrastThemes.has(theme)) { console.log('WCAG contrast '+theme+': '+table.map(row => row.pair+' '+row.ratio.toFixed(2)).join(' · ')); contrastThemes.add(theme); }
}
async function resize(page,size) {
  await page.setViewportSize(size);
  // The media-query change event moves the tray asynchronously after a resize.
  if (await page.locator('.cw-tray-anchor').count() && await page.locator('.cw-mailbox-tray').count()) {
    const parent=size.width>=960 ? '.cw-home-side' : '.cw-answer';
    await page.locator(parent+' .cw-mailbox-tray').waitFor({state:'visible'});
  }
}
async function bothWidths(page,label,screenshot=false) {
  const originalReducedMotion=await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(() => document.fonts.ready);
  const originalTheme=await page.locator('html').getAttribute('data-theme');
  for (const theme of ['light','dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme=theme,theme);
    await accessibility(page,label+' '+theme); await contrast(page,theme);
    await resize(page,{width:320,height:900}); await overflow(page,label+' '+theme+' 320');
    await page.evaluate(() => document.documentElement.style.fontSize='200%');
    await overflow(page,label+' '+theme+' 320 at 200% text');
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
  }
  await page.evaluate(theme => { if (theme===null) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=theme; },originalTheme);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.deepEqual(await page.locator('body *').evaluateAll(els => els.filter(el => el.getClientRects().length).flatMap(el => ['', '::before', '::after'].map(pseudo => getComputedStyle(el,pseudo || null))).filter(style => style.animationName !== 'none' || style.transitionDuration.split(',').some(time => parseFloat(time)>0)).map(style => style.animationName)),[],label+': reduced motion disables animations/transitions');
  await page.emulateMedia({reducedMotion:originalReducedMotion ? 'reduce' : 'no-preference'});
  await resize(page,{width:390,height:844}); await overflow(page,label+' 390');
  if (screenshot && !capturedScreens.has(label)) await page.screenshot({path:`.impeccable/review/chirashi-${label}.png`,fullPage:true});
  await resize(page,{width:1280,height:900}); await overflow(page,label+' 1280');
  if (screenshot && !capturedScreens.has(label)) await page.screenshot({path:`.impeccable/review/chirashi-${label}-desktop.png`,fullPage:true});
  if (screenshot) capturedScreens.add(label);
  for (const width of [320,768,960,1440]) { await resize(page,{width,height:900}); await overflow(page,label+' '+width); }
  await resize(page,{width:390,height:844});
}
async function ticketChecks(page) {
  const ticket=page.locator('.cw-ticket');
  assert.equal(await ticket.count(),1,'answer is a ticket');
  assert.equal(await page.locator('.cw-hero-scene').count(),0,'hero disappears once flyers exist');
  const route=ticket.locator('.cw-route');
  assert.ok(await ticket.getByText("Remove any place you don't want. Start when you're ready.",{exact:true}).isVisible(),'ticket explains the remove button');
  const rows=route.locator(':scope > .cw-route-station, :scope > .cw-route-stop');
  assert.ok(await rows.count()>=3,'route includes endpoints and stops');
  assert.ok(await rows.first().evaluate(el => el.classList.contains('cw-route-station')),'route starts at a station');
  assert.ok(await rows.last().evaluate(el => el.classList.contains('cw-route-station')),'route ends at a station');
  assert.match(await ticket.locator('h1').evaluate(el => getComputedStyle(el).fontFamily),/^"?Dela Gothic One/);
  assert.doesNotMatch(await page.locator('.cw-header, .cw-snap, .cw-tray').allTextContents().then(parts => parts.join(' ')),/[📷📄📞♻🔒⚙◎]/u,'icons use SVG or print labels');
}
async function sealChecks(page) {
  assert.equal(await page.locator('#ink').count(),1,'shared ink filter exists exactly once');
  assert.ok(await page.locator('svg g[filter="url(#ink)"]').count()>0,'SVG seals use the ink filter');
  const ids=await page.locator('textPath').evaluateAll(paths => paths.flatMap(path => [path.id,path.getAttribute('href')?.slice(1)]));
  assert.ok(ids.length>0 && ids.every(Boolean));
  assert.equal(new Set(ids).size,ids.length,'all textPath IDs and referenced arc IDs are unique, including repeated stamps');
  assert.ok(await page.locator('textPath').evaluateAll(paths => paths.every(path => document.getElementById(path.getAttribute('href').slice(1)))),'every textPath has an arc');
}
async function lineChecks(page) {
  const o=active(await readState(page)), map=page.locator('.cw-board .cw-line-map');
  assert.equal(await map.count(),1);
  assert.equal(await map.getAttribute('aria-hidden'),'true');
  assert.equal(await map.locator('[data-line-stop]').count(),o.stopIds.length,'one line dot per stop, including groceries');
  assert.equal(await map.locator('.cw-line-dot').count(),o.stopIds.length+2,'line includes start and finish dots');
  assert.equal(await map.locator('[data-line-stop].current').count(),1);
  assert.equal(await map.locator('[data-line-stop].current').getAttribute('data-line-stop'),o.stopIds[o.cursor]);
  assert.equal(await map.locator('.current em').textContent(),'次');
  for (const id of o.skipped ?? []) assert.equal(await map.locator(`[data-line-stop="${id}"].skipped`).count(),1);
  for (const s of o.stamps) assert.equal(await map.locator(`[data-line-stop="${s.stopId}"].stamped`).count(),1);
}
async function sampleLinkChecks(root) {
  assert.equal(await root.locator('a[href^="tel:"]').count(),0,'sample numbers never dial');
  assert.equal(await root.locator('a[href^="http:"], a[href^="https:"], a[href^="//"]').count(),0,'sample views cannot open external sites');
}
async function newPhone(options={}) {
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],reducedMotion:'reduce',...options});
  const page=await context.newPage(); page.on('pageerror',e => errors.push(e.message)); await page.clock.setFixedTime(clock); page.on('dialog',async d => { if (d.type()!=='beforeunload') errors.push('Unexpected dialog: '+d.message()); await d.accept(); });
  page.on('request',r => { if (r.url().endsWith('/api/merge')) merges.push(r.postDataJSON()); if (new URL(r.url()).pathname==='/api/locate') locates.push(Object.fromEntries(new URL(r.url()).searchParams)); if (r.url().endsWith('/api/rank')) ranks.push(r.postDataJSON()); });
  return {context,page};
}
async function open(page) { await page.goto(base); await page.getByText('Demo mode',{exact:true}).waitFor(); }
async function setup(page) {
  await open(page); await welcome(page);
}
async function welcome(page) {
  assert.equal(await page.locator('#setup[open]').count(),0,'first visit has no setup gate');
  await page.locator('.cw-snap').getByRole('heading',{name:'One good reason to go outside.',exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'Photograph my flyers',exact:true}).isVisible());
  assert.ok(await page.getByRole('button',{name:'Try a sample mailbox',exact:true}).isVisible());
  assert.ok(await page.locator('.cw-hero-scene').isVisible(),'welcome has the decorative scene');
  assert.equal(await page.locator('#hero-arc').count(),1);
  assert.equal(await page.locator('#ink').count(),1);
  assert.equal(await page.locator('.cw-hero-seal').evaluate(el => getComputedStyle(el).animationName),'none');
  await resize(page,{width:390,height:844}); await page.evaluate(() => window.scrollTo(0,0));
  for (const el of [page.locator('.cw-welcome h1'),page.locator('.cw-welcome-copy > .cw-muted'),page.locator('[data-action=take-photo]'),page.locator('[data-action=choose-photos]')]) {
    assert.ok(await el.evaluate(el => { const r=el.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight; }),'welcome essentials fit above the fold');
  }
  await bothWidths(page,'welcome',true);
  await resize(page,{width:1280,height:900});
  await page.locator('.cw-home.cw-home-single').waitFor({state:'visible'});
  assert.ok(await page.locator('.cw-home').evaluate(el => el.classList.contains('cw-home-single')),'empty side does not reserve a desktop column');
  assert.ok(await page.locator('.cw-welcome').evaluate(el => {
    const copy=el.querySelector('.cw-welcome-copy').getBoundingClientRect();
    return [...el.querySelectorAll('.cw-hero-scene .cw-mini, .cw-hero-ticket, .cw-hero-seal')].every(node => {
      const r=node.getBoundingClientRect(); return r.left>=copy.right && r.right<=innerWidth;
    });
  }),'desktop scene clears the text column and keeps the seal in the viewport');
  await resize(page,{width:390,height:844});
}
async function chooseStart(page) {
  await page.getByRole('heading',{name:'Where do you start walking?',exact:true}).waitFor();
  assert.equal(await page.locator('dialog[open]').count(),0,'start choice is inline');
  await bothWidths(page,'start-chooser',true);
  await page.getByRole('button',{name:'Pick a station',exact:true}).click();
  await page.locator('#start-line').selectOption('skytree'); await page.locator('#start-station').selectOption(station.id);
  await page.getByRole('button',{name:'Use this station',exact:true}).click();
  await page.locator('.cw-start').waitFor({state:'detached'});
  assert.equal((await readState(page)).settings.home,station.id);
}
async function settingsStation(page) {
  await page.locator('#settings-button').click(); await page.locator('#setup[open]').waitFor();
  assert.ok(await page.getByRole('group',{name:'Appearance',exact:true}).isVisible());
  await page.getByRole('group',{name:'Appearance',exact:true}).scrollIntoViewIfNeeded();
  await bothWidths(page,'settings',true);
  assert.equal(await page.locator('#setup-weight').isVisible(),false,'weight stays under More');
  await page.locator('#setup-line').selectOption('skytree'); await page.locator('#setup-station').selectOption(station.id);
  await page.getByRole('button',{name:'Save',exact:true}).click(); await page.locator('#setup[open]').waitFor({state:'detached'});
  assert.equal((await readState(page)).settings.home,station.id);
}
async function files(page,count) {
  const encoded=await page.evaluate(count => Array.from({length:count},(_,i) => {
    const canvas=document.createElement('canvas'); canvas.width=600; canvas.height=900;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,600,900);
    ctx.fillStyle=['#174cbc','#b43822','#245c35'][i%3]; ctx.fillRect(25,25,550,140);
    ctx.fillStyle='white'; ctx.font='30px sans-serif'; ctx.fillText('Fictional flyer '+(i+1),45,100);
    ctx.fillStyle='#172536'; ctx.fillText('Printed trial and prices',45,240);
    return canvas.toDataURL('image/png').split(',')[1];
  }),count);
  return encoded.map((data,i) => ({name:`fictional-page-${i+1}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')}));
}
async function select(page,images) {
  await page.locator('#photos-input').setInputFiles(images);
  await page.waitForFunction(count => document.querySelectorAll('.cw-photo').length===count && !document.querySelector('[data-action=read]')?.disabled,images.length,{timeout:60000});
}
async function finished(page) {
  await page.locator('#reading-card').waitFor({state:'detached',timeout:90000});
  await page.waitForFunction(() => [...document.querySelectorAll('.cw-stop-row img')].every(i => i.complete && i.naturalWidth>0));
}
async function interceptRead(page,handler) {
  await page.route('**/api/read-page',async route => {
    const request=route.request().postDataJSON(); reads.push(request);
    assert.ok(['page','tiles'].includes(request.mode)); assert.equal(request.tiles.length,request.mode==='page' ? 1 : 6);
    for (const image of request.tiles) { assert.match(image,/^data:image\/jpeg;base64,/); assert.ok(Buffer.byteLength(image)<=2*1024*1024); }
    const result=await handler(request,route);
    if (!result) return;
    const tiles=request.tiles.map(() => result);
    const body=tiles.map((tile,index) => JSON.stringify({type:'tile',index,tile})).join('\r\n')+'\r\n'+JSON.stringify({type:'done',pageId:request.pageId,tiles});
    try { await route.fulfill({status:200,contentType:'application/x-ndjson',body}); } catch (e) { if (!page.isClosed() && !/closed|disposed|Invalid InterceptionId|already handled|aborted/i.test(e.message)) throw e; }
  });
}
async function waitServer() {
  for (let n=0;n<100;n++) { if (serverError) throw serverError; if (server.exitCode!==null) throw new Error(logs); try { if (logs.includes(base) && (await fetch(base+'/api/config')).ok) return; } catch {} await delay(100); }
  throw new Error('Mock server did not start: '+logs);
}
async function installAndOfflineChecks() {
  // A separate localhost context opts into the SW; all route-based tests stay on 127.0.0.1.
  const origin=base.replace('127.0.0.1','localhost');
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],
    geolocation:{latitude:homePoint.lat,longitude:homePoint.lon,accuracy:1},reducedMotion:'reduce'});
  try {
    const page=await context.newPage();
    page.on('pageerror',e => errors.push(e.message));
    await page.clock.setFixedTime(clock);
    await page.goto(origin); await page.getByText('Demo mode',{exact:true}).waitFor();
    const description='Photograph the flyers in your mailbox. An open model (Gemma 4) picks the places worth walking to, plans a short walk past them, and gives you an ink stamp at each stop.';
    const title='Worth the Walk? — turn mailbox flyers into a walk';
    for (const [selector,content] of [
      ['meta[name="description"]',description], ['meta[property="og:type"]','website'],
      ['meta[property="og:site_name"]','Worth the Walk?'], ['meta[property="og:title"]',title],
      ['meta[property="og:description"]',description], ['meta[property="og:url"]','https://worth-the-walk.onrender.com/'],
      ['meta[property="og:image:width"]','1200'], ['meta[property="og:image:height"]','630'],
      ['meta[property="og:image:alt"]','A pile of flyers turning into a train-ticket walk with an ink stamp'],
      ['meta[name="twitter:card"]','summary_large_image'], ['meta[name="twitter:title"]',title],
      ['meta[name="twitter:description"]',description], ['meta[name="apple-mobile-web-app-title"]','Worth the Walk']
    ]) assert.equal(await page.locator(selector).getAttribute('content'),content);
    const image=await page.locator('meta[property="og:image"]').getAttribute('content');
    assert.equal(image,'https://worth-the-walk.onrender.com/icons/og-image.png');
    assert.equal(await page.locator('meta[name="twitter:image"]').getAttribute('content'),image);
    // Verify the asset on the same mock server, without depending on a deployed version.
    const share=await context.request.get(origin+new URL(image).pathname);
    assert.equal(share.status(),200); assert.equal(share.headers()['content-type'],'image/png');
    const manifestURL=await page.locator('link[rel="manifest"]').evaluate(el => el.href);
    assert.equal(manifestURL,origin+'/manifest.webmanifest');
    const response=await context.request.get(manifestURL);
    assert.equal(response.status(),200); assert.equal(response.headers()['content-type'],'application/manifest+json');
    const manifest=await response.json();
    assert.deepEqual(manifest,{name:'Worth the Walk?',short_name:'Worth the Walk',description,id:'/',start_url:'/',scope:'/',
      display:'standalone',orientation:'portrait',background_color:'#e4e9e1',theme_color:'#f6f8f2',lang:'en',icons:[
        {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
        {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
        {src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]});
    assert.deepEqual(await page.locator('link[rel="icon"]').evaluateAll(els => els.map(el => ({href:el.getAttribute('href'),sizes:el.getAttribute('sizes'),type:el.type}))),[
      {href:'/icons/favicon-32.png',sizes:'32x32',type:'image/png'}, {href:'/icons/favicon-48.png',sizes:'48x48',type:'image/png'}]);
    assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'/icons/apple-touch-icon.png');
    for (const path of [...manifest.icons.map(icon => icon.src),'/icons/apple-touch-icon.png','/icons/favicon-32.png','/icons/favicon-48.png']) {
      const icon=await context.request.get(origin+path); assert.equal(icon.status(),200); assert.equal(icon.headers()['content-type'],'image/png');
    }
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const apiResponse=page.waitForResponse(r => new URL(r.url()).pathname==='/api/config');
    await page.evaluate(() => fetch('/api/config').then(r => r.json()));
    const api=await apiResponse; assert.equal(api.status(),200); assert.equal(api.fromServiceWorker(),false,'API bypasses the controlling service worker');
    await page.getByRole('button',{name:'Try a sample mailbox',exact:true}).click();
    await page.getByRole('heading',{name:'Where do you start walking?',exact:true}).waitFor();
    await page.getByRole('button',{name:'Use my location',exact:true}).click();
    await page.getByRole('button',{name:'Start the walk →',exact:true}).click();
    await page.getByRole('button',{name:"I'm here",exact:true}).click();
    await page.getByRole('button',{name:'Stamp anyway',exact:true}).click();
    await page.locator('.cw-stamp.self').waitFor();
    const before=active(await readState(page)); assert.equal(before.stamps.length,1);
    await context.setOffline(true);
    const reload=await page.reload(); assert.equal(reload.fromServiceWorker(),true,'offline navigation comes from the cached shell');
    await page.locator('.cw-walk-mode').waitFor(); await page.locator('#offline-strip').waitFor();
    await page.locator('.cw-stamp.self').waitFor();
    assert.equal(await page.evaluate(() => navigator.onLine),false);
    assert.deepEqual(active(await readState(page)),before,'walk, cursor and stamps survive an offline reload');
    assert.match(await page.locator('#offline-strip').textContent(),/Reading flyers needs a connection/);
    assert.equal(await page.locator('.cw-stamp-count').textContent(),'1');
    await context.setOffline(false);
    await page.locator('#offline-strip').waitFor({state:'detached'});
    await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor();
    assert.deepEqual(active(await readState(page)),before,'reconnecting preserves the same walk');
  } finally { await context.setOffline(false); await context.close(); }
}
async function nonHappyChecks(sampleState) {
  const saved={...structuredClone(sampleState),flyers:[],outings:[],labels:{},pages:{},overrides:{}};
  async function seed(page,state=saved) {
    await page.addInitScript(({key,state}) => localStorage.setItem(key,JSON.stringify(state)),{key,state});
  }
  const empty=await newPhone();
  const homeFlyer=sampleState.flyers.find(f => f.bucket==='home'), tossFlyer=sampleState.flyers.find(f => f.bucket==='toss');
  const emptyState={...structuredClone(saved),flyers:Array.from({length:6},(_,i) => ({...structuredClone(i<2 ? homeFlyer : tossFlyer),id:'empty-'+i,pageIds:[],sample:false}))};
  await seed(empty.page,emptyState); await open(empty.page);
  await empty.page.getByRole('heading',{name:'No walk today',exact:true}).waitFor();
  assert.ok(await empty.page.getByText('We read 6 flyers: 2 deals to use at home, 4 safe to recycle. None is a place to walk to.',{exact:true}).isVisible());
  assert.equal(await empty.page.locator('.cw-slot').count(),2);
  const chooser=empty.page.waitForEvent('filechooser');
  assert.equal(await empty.page.getByRole('button',{name:'Add more flyers',exact:true}).count(),0);
  assert.ok(await empty.page.getByRole('button',{name:'Photograph my flyers',exact:true}).evaluate(el => el.classList.contains('cw-primary')));
  await empty.page.getByRole('button',{name:'Photograph my flyers',exact:true}).click(); await chooser;
  await bothWidths(empty.page,'empty-walk',true);
  await empty.page.locator('#stamps-button').click();
  assert.ok(await empty.page.getByText('Your first stamp is one walk away.',{exact:true}).isVisible());
  assert.equal(await empty.page.locator('.cw-month-rally .cw-rally > *').count(),3);
  await empty.page.getByRole('button',{name:'Plan a walk',exact:true}).click();
  await empty.page.locator('#sheet[open]').waitFor({state:'detached'});
  await empty.page.waitForFunction(() => document.activeElement?.id==='answer-heading');
  await empty.context.close();

  const blocked=await newPhone();
  await blocked.page.addInitScript(() => { Storage.prototype.setItem=function() { throw new DOMException('Blocked','SecurityError'); }; });
  await open(blocked.page); await blocked.page.locator('#saving-strip').waitFor();
  assert.ok(await blocked.page.getByText("This browser isn't saving. Your mailbox and stamps will be lost when you close this page.",{exact:true}).isVisible());
  await blocked.page.getByRole('button',{name:'Dismiss saving warning',exact:true}).click();
  await blocked.page.locator('#settings-button').click(); await blocked.page.getByLabel('Dark',{exact:true}).check();
  assert.equal(await blocked.page.locator('#saving-strip').count(),0,'saving warning stays dismissed for this session');
  await blocked.context.close();

  const config=await newPhone(); await seed(config.page);
  await config.page.route('**/api/config',route => route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await config.page.goto(base); await config.page.locator('#service-strip').waitFor();
  assert.ok(await config.page.getByText('Reading is unavailable right now. You can still try the sample mailbox.',{exact:true}).isVisible());
  const readBefore=reads.length, mergeBefore=merges.length;
  await config.page.locator('#service-strip').getByRole('button',{name:'Try a sample mailbox',exact:true}).click();
  await config.page.getByRole('heading',{name:'4 places worth the walk',exact:true}).waitFor();
  assert.equal(reads.length,readBefore); assert.equal(merges.length,mergeBefore,'sample needs no reading service');
  await config.context.close();

  const offline=await newPhone(); await seed(offline.page,{...structuredClone(sampleState),outings:[],labels:{}}); await open(offline.page);
  await offline.page.clock.install({time:clock});
  await select(offline.page,await files(offline.page,1));
  await offline.context.setOffline(true); await offline.page.locator('#offline-strip').waitFor();
  assert.equal(await offline.page.getByRole('button',{name:'Read 1 flyer',exact:true}).isDisabled(),true);
  assert.ok(await offline.page.getByText('Reading flyers needs a connection.',{exact:true}).isVisible());
  await bothWidths(offline.page,'offline',true);
  await offline.context.setOffline(false); await offline.page.locator('#offline-strip').waitFor({state:'detached'});
  await offline.page.locator('#notice').getByText('Back online.',{exact:true}).waitFor();
  assert.equal(await offline.page.locator('#notice').getAttribute('role'),'status');
  await resize(offline.page,{width:390,height:844}); await offline.page.evaluate(() => scrollTo(0,document.body.scrollHeight));
  assert.ok(await offline.page.evaluate(() => scrollY>0),'toast check uses a scrolled mailbox');
  assert.ok(await offline.page.locator('#notice').evaluate(el => { const r=el.getBoundingClientRect(),dock=document.querySelector('.cw-read-dock').getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth && r.bottom<=dock.top; }),'toast stays in viewport above dock while scrolled');
  await bothWidths(offline.page,'toast',true);
  await offline.page.clock.fastForward(6100); assert.equal(await offline.page.locator('#notice').isVisible(),false,'info hides after six seconds');
  await offline.page.route('**/api/read-page',route => route.fulfill({status:429,contentType:'application/json',headers:{'Retry-After':'120'},body:'{}'}));
  await offline.page.getByRole('button',{name:'Read 1 flyer',exact:true}).click();
  await offline.page.locator('[data-reading-page][data-status=failed]').waitFor();
  await offline.page.getByRole('button',{name:'Retry page 1',exact:true}).waitFor();
  await offline.page.locator('#reading-failures').getByText('Reading limit reached — try again in 2 min',{exact:true}).waitFor();
  assert.equal(await offline.page.locator('#progress').textContent(),'');
  assert.equal(await offline.page.locator('#reading-message').textContent(),'');
  assert.equal(await offline.page.locator('#reading-hint').isVisible(),false);
  assert.equal(await offline.page.locator('#reading-progress').isVisible(),false);
  assert.equal(await offline.page.locator('#reading-count').isVisible(),false);
  await offline.page.getByText('None of these pages could be read.',{exact:true}).waitFor();
  assert.ok(await offline.page.getByRole('button',{name:'Retry all',exact:true}).isVisible());
  assert.ok(await offline.page.getByRole('button',{name:'Remove these photos',exact:true}).isVisible());
  await bothWidths(offline.page,'read-failed',true);
  assert.equal(await offline.page.locator('#notice').getAttribute('role'),'alert');
  await offline.page.clock.fastForward(7000); assert.ok(await offline.page.locator('#notice').isVisible(),'error persists');
  await offline.page.getByRole('button',{name:'Dismiss',exact:true}).click(); assert.equal(await offline.page.locator('#notice').isVisible(),false);
  await offline.page.unroute('**/api/read-page');
  for (const [status,error,reason] of [[413,'Payload too large','Photo too large — try a closer, smaller photo'],[400,'Timed out','Took too long'],[400,'Unknown',"Couldn't read this page"]]) {
    await offline.page.route('**/api/read-page',route => route.fulfill({status,contentType:'application/json',body:JSON.stringify({error})}));
    await offline.page.getByRole('button',{name:'Retry page 1',exact:true}).click();
    await offline.page.locator('#reading-failures').getByText(reason,{exact:true}).waitFor();
    await offline.page.waitForFunction(() => !document.querySelector('[data-action=retry-page]').disabled);
    await offline.page.unroute('**/api/read-page');
  }
  await offline.page.getByRole('button',{name:'Remove these photos',exact:true}).click();
  const images=await files(offline.page,2);
  await select(offline.page,images);
  const disconnected=gate(), requestSeen=offline.page.waitForRequest('**/api/read-page');
  await offline.page.route('**/api/read-page',async route => { await disconnected.promise; await route.abort('internetdisconnected'); });
  await offline.page.getByRole('button',{name:'Read 2 flyers',exact:true}).click();
  await requestSeen;
  await offline.context.setOffline(true); disconnected.release();
  await offline.page.waitForFunction(() => document.querySelectorAll('[data-status=failed]').length===2);
  await offline.page.getByText('None of these pages could be read.',{exact:true}).waitFor();
  assert.equal(await offline.page.locator('#reading-failures').getByText(/No connection/).count(),1);
  assert.ok(await offline.page.getByRole('button',{name:'Retry all',exact:true}).isDisabled());
  await offline.context.setOffline(false);
  await offline.page.getByRole('button',{name:'Remove these photos',exact:true}).click();
  await offline.page.locator('#photos-input').setInputFiles([images[0],{name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('not a photo')},{name:'unsupported.heic',mimeType:'image/heic',buffer:Buffer.from('unsupported photo')}]);
  await offline.page.locator('#notice').getByText('2 files skipped: not photos.',{exact:true}).waitFor();
  assert.equal(await offline.page.locator('.cw-photo').count(),1,'accepted photo survives skipped files');
  assert.equal(await offline.page.locator('#notice').getAttribute('role'),'status');
  await offline.page.clock.fastForward(7000); assert.ok(await offline.page.locator('#notice').isVisible(),'warn persists');
  await offline.context.close();

  const hidden=await newPhone();
  const hiddenState={...structuredClone(sampleState),outings:[],labels:Object.fromEntries(sampleState.flyers.filter(f => f.bucket==='walk').map(f => [f.id,0]))};
  await seed(hidden.page,hiddenState); await open(hidden.page);
  await hidden.page.getByRole('heading',{name:'No walk today',exact:true}).waitFor();
  assert.ok(await hidden.page.getByText('The places on these flyers have ended their offers or you said Not for me.',{exact:true}).isVisible());
  await hidden.page.getByRole('button',{name:'Show places I said Not for me',exact:true}).click();
  await hidden.page.getByRole('heading',{name:'4 places worth the walk',exact:true}).waitFor();
  assert.deepEqual((await readState(hidden.page)).labels,{});
  await hidden.page.evaluate(key => {
    const s=JSON.parse(localStorage.getItem(key));
    s.outings=[{id:'four-stamps',createdAt:'2026-10-11T02:00:00Z',start:s.settings.place,end:s.settings.place,stopIds:s.flyers.filter(f => f.bucket==='walk').map(f => f.id),meters:1000,minutes:16,mode:'walk',status:'done',cursor:4,skipped:[],stamps:s.flyers.filter(f => f.bucket==='walk').map(f => ({stopId:f.id,kind:'self',at:'2026-10-11T02:00:00Z'})),used:[]}];
    localStorage.setItem(key,JSON.stringify(s));
  },key);
  // The init script seeds once per navigation, so remove it by using a separate context for the four-stamp fixture.
  const rallyState=await readState(hidden.page), rally=await newPhone(); await seed(rally.page,rallyState); await open(rally.page);
  await rally.page.locator('#stamps-button').click();
  assert.equal(await rally.page.locator('.cw-month-rally .cw-rally > *').count(),6,'four stamps pad to six cells');
  assert.equal(await rally.page.locator('.cw-month-rally .cw-spot').count(),2);
  await rally.context.close();
  await hidden.context.close();

  const address=await newPhone(), missing={...structuredClone(sampleState.flyers.find(f => f.bucket==='walk')),id:'missing-address',pageIds:[],sample:false,location:null};
  await seed(address.page,{...structuredClone(saved),flyers:[missing]}); await open(address.page);
  assert.ok(await address.page.getByText('No address on the flyer',{exact:true}).isVisible());
  await address.page.getByRole('button',{name:'Add address',exact:true}).click();
  await address.context.setOffline(true);
  assert.equal(await address.page.getByRole('button',{name:'Find address',exact:true}).isDisabled(),true);
  assert.ok(await address.page.getByText('Finding an address needs a connection.',{exact:true}).isVisible());
  await address.context.setOffline(false); await address.page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await address.page.route('**/api/locate?*',route => route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await address.page.getByLabel('Printed address',{exact:true}).fill('Fictional unknown address');
  await address.page.getByRole('button',{name:'Find address',exact:true}).click();
  await address.page.locator('.cw-locate').getByText("Couldn't find that. Try the address printed on the flyer (住所) or the full business name.",{exact:true}).waitFor();
  assert.equal(await address.page.locator('#notice').isVisible(),false,'address failure stays inline');
  await address.context.close();
  const unplaced=await newPhone();
  await seed(unplaced.page,{...structuredClone(saved),flyers:[{...missing,address:'Fictional printed address'}]}); await open(unplaced.page);
  assert.ok(await unplaced.page.getByText("Couldn't place this address near your start",{exact:true}).isVisible());
  assert.ok(await unplaced.page.getByRole('button',{name:'Add address',exact:true}).isVisible());
  await unplaced.context.close();

  const prices=await newPhone(), priceFlyer={...structuredClone(sampleState.flyers.find(f => f.category==='supermarket')),id:'printed-prices',pageIds:[],offers:[],items:[
    {name_en:'Tea',name_ja:'茶',price_yen:108,price_tax_incl_yen:117,conditions:[]},
    {name_en:'Tofu',name_ja:'豆腐',price_yen:88,conditions:[]},
    {name_en:'Milk',name_ja:'牛乳',price_yen:198,conditions:[]}
  ]};
  await seed(prices.page,{...structuredClone(saved),flyers:[priceFlyer]}); await open(prices.page);
  const priceRow=prices.page.locator('.cw-stop-row[data-flyer=printed-prices]');
  assert.equal(await priceRow.locator('.cw-prices').textContent(),'3 printed prices · from ¥88');
  assert.equal(await priceRow.locator('.cw-sticker').count(),0);
  await priceRow.locator('[data-action=flyer-sheet]').click();
  const teaMeta=prices.page.locator('#sheet[open] [data-item-index="0"] .cw-meta');
  assert.equal(await teaMeta.textContent(),'¥108 before tax · ¥117 with tax');
  assert.equal(await teaMeta.evaluate(el => getComputedStyle(el).fontVariantNumeric),'tabular-nums');
  assert.equal(await prices.page.locator('#sheet[open] [data-item-index="1"] .cw-meta').textContent(),'¥88');
  await prices.page.keyboard.press('Escape');
  await prices.page.getByRole('button',{name:'Start the walk →',exact:true}).click();
  await prices.page.locator('.cw-walk-mode').waitFor();
  assert.equal(await prices.page.locator('.cw-walk-card .cw-prices').textContent(),'3 printed prices · from ¥88');
  assert.equal(await prices.page.locator('.cw-walk-card .cw-sticker').count(),0);
  await prices.context.close();

  const stationFailure=await newPhone(); let failCoordinates=true;
  await stationFailure.page.route('**/station-coordinates.json',route => failCoordinates ? route.fulfill({status:503,body:''}) : route.continue());
  await open(stationFailure.page); await stationFailure.page.locator('.cw-welcome [data-action=sample]').click();
  await stationFailure.page.locator('.cw-start').getByText('Station coordinates could not be loaded. Reload to pick a station.',{exact:true}).waitFor();
  failCoordinates=false; await stationFailure.page.getByRole('button',{name:'Reload',exact:true}).click();
  await stationFailure.page.getByRole('button',{name:'Reload',exact:true}).waitFor({state:'detached'});
  await stationFailure.context.close();
}
try {
  server=spawn(process.execPath,['scripts/serve.mjs','--mock'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'4180',HOST:'127.0.0.1',MOCK_GEMMA:'1',SENTRY_DSN:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
  server.on('error',e => { serverError=e; }); server.stdout.on('data',c => { logs+=c; }); server.stderr.on('data',c => { logs+=c; });
  await waitServer(); browser=await chromium.launch({channel:process.env.TEST_BROWSER || 'msedge'}); await mkdir('.impeccable/review',{recursive:true});
  await installAndOfflineChecks();
  // Appearance applies immediately, follows the device only by choice, and survives Save/reload.
  const appearance=await newPhone({colorScheme:'dark'}); await setup(appearance.page);
  async function themeChecks(page,scheme,attribute) {
    assert.equal(await page.locator('html').getAttribute('data-theme'),attribute);
    const expected=scheme === 'dark' ? 'rgb(11, 15, 18)' : 'rgb(228, 233, 225)';
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--desk').trim()),scheme === 'dark' ? '#0b0f12' : '#e4e9e1');
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor),expected);
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme),scheme);
  }
  async function metaChecks(page,light,dark=light) {
    assert.deepEqual(await page.locator('meta[name="theme-color"]').evaluateAll(els => els.map(el => el.content)),[light,dark]);
  }
  await themeChecks(appearance.page,'light','light'); await metaChecks(appearance.page,'#f6f8f2');
  await appearance.page.locator('#settings-button').click(); await appearance.page.getByLabel('Dark',{exact:true}).check();
  await themeChecks(appearance.page,'dark','dark'); await metaChecks(appearance.page,'#151b1f');
  assert.equal((await readState(appearance.page)).settings.theme,'dark');
  await appearance.page.reload(); await appearance.page.getByText('Demo mode',{exact:true}).waitFor();
  await themeChecks(appearance.page,'dark','dark'); await metaChecks(appearance.page,'#151b1f');
  await appearance.page.locator('#settings-button').click(); await appearance.page.getByLabel('Match my device',{exact:true}).check();
  await themeChecks(appearance.page,'dark',null); await metaChecks(appearance.page,'#f6f8f2','#151b1f');
  await appearance.page.emulateMedia({colorScheme:'light'}); await themeChecks(appearance.page,'light',null);
  await appearance.page.getByRole('button',{name:'Save',exact:true}).click();
  await appearance.page.reload(); await appearance.page.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal((await readState(appearance.page)).settings.theme,'auto'); await themeChecks(appearance.page,'light',null);
  // A legacy save and an unrecognised preference both upgrade to light.
  for (const value of [null,'unexpected']) {
    await appearance.page.evaluate(({key,value}) => { const s=JSON.parse(localStorage.getItem(key)); if (value===null) delete s.settings.theme; else s.settings.theme=value; localStorage.setItem(key,JSON.stringify(s)); },{key,value});
    await appearance.page.reload(); await appearance.page.getByText('Demo mode',{exact:true}).waitFor();
    assert.equal((await readState(appearance.page)).settings.theme,'light'); await themeChecks(appearance.page,'light','light');
  }
  await appearance.context.close();
  const {context,page}=await newPhone();
  const last=gate(), detail=gate(), pageIndices=new Map(); let index=0, marketId, detailFinished=false;
  const pilates=structuredClone(fixture[0]); pilates.category='fitness'; pilates.business={name:'Fictional Pilates <img src=x onerror=alert(1)>',kind:'Pilates studio'}; pilates.phones=['0120-000-666']; pilates.offers=[{kind:'discount',text_en:'Trial',text_ja:'体験',regular_yen:3300,offer_yen:1000,deadline_text:'10月31日まで'}];
  const batch=[fixture[0],fixture[1],fixture[2],pilates,fixture[3],fixture[4],fixture[5]];
  await interceptRead(page,async request => {
    if (request.mode==='page') pageIndices.set(request.pageId,index++);
    const i=pageIndices.get(request.pageId), tile=structuredClone(batch[i]);
    if (i===0) tile.flyer_count=3;
    if (i===6) await last.promise;
    if (i===2 && request.mode==='page') { marketId=request.pageId; tile.items[0].price_yen=999; tile.items.push({name_en:'Misread item',name_ja:'架空誤読品',price_yen:888,conditions:[]}); }
    if (request.mode==='tiles') { assert.equal(i,2,'only the supermarket has an adaptive detail pass'); await detail.promise; detailFinished=true; }
    return tile;
  });
  await setup(page);
  assert.equal(await page.locator('[data-tab],[data-action=rate],[data-stop],[data-shopping]').count(),0);
  const images=await files(page,7);
  await select(page,[images[0]]); await page.getByRole('button',{name:'Remove page 1',exact:true}).click();
  assert.equal(await page.locator('.cw-photo').count(),0); assert.deepEqual(await rows(page),[]); assert.deepEqual(await rows(page,'thumbs'),[]);
  await select(page,images);
  assert.ok(await page.getByText('Add every page of every flyer, then tap Read.',{exact:true}).isVisible());
  assert.equal(await page.locator('.cw-hero-scene').count(),0,'hero disappears after selecting photos');
  assert.ok(await page.getByText('7 pages ready',{exact:true}).isVisible());
  assert.equal(await page.locator('.cw-photo > .cw-print').first().textContent(),'Page 1');
  await page.getByRole('button',{name:'Rotate page 2',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.cw-photo')[1]?.dataset.rotation==='90' && !document.querySelector('[data-action=read]').disabled);
  assert.ok(await page.locator('.cw-photo img').nth(1).evaluate(i => i.naturalWidth>i.naturalHeight));
  assert.equal((await rows(page)).length,7); const thumbsBefore=await rows(page,'thumbs'); assert.equal(thumbsBefore.length,7);
  assert.ok(thumbsBefore.every(t => t.type==='image/jpeg' && t.size>0));
  assert.ok(await page.getByRole('button',{name:'Read 7 flyers',exact:true}).evaluate(el => { const r=el.getBoundingClientRect(); return r.bottom<=innerHeight && r.top>=0; }),'read action sits above the bottom edge');
  await bothWidths(page,'snap',true);
  for (const width of [320,390,768,1280,1440]) {
    await resize(page,{width,height:844});
    await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
    assert.ok(await page.getByText('Add every page of every flyer, then tap Read.',{exact:true}).evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.cw-read-dock').getBoundingClientRect().top),'last hint clears the read dock');
  }
  await resize(page,{width:390,height:844});
  await page.getByRole('button',{name:'Read 7 flyers',exact:true}).click();
  await chooseStart(page);
  await page.locator('#reading-progress').waitFor(); await page.locator('.cw-stop-row').first().waitFor();
  assert.ok(await page.getByText('Keep this screen open. Cards appear as each flyer is read.',{exact:true}).isVisible());
  assert.match(await page.locator('#reading-count').textContent(),/Reading \d of 7 · about \d min left/);
  assert.equal(await page.locator('#progress').getAttribute('aria-live'),'polite');
  assert.ok(await page.locator('#progress').evaluate(el => getComputedStyle(el).clipPath === 'inset(50%)'),'live progress is visually hidden while the reading card is shown');
  assert.equal(await page.locator('progress').count(),1); assert.ok(Object.keys((await readState(page)).pages).length<7,'first stop appears before last page finishes');
  await page.locator('[data-reading-prices]').waitFor(); assert.equal(detailFinished,false);
  assert.equal(await page.locator('[data-reading-page]').count(),7);
  assert.ok(await page.locator('[data-reading-page][data-status=detailing]').getByText('Reading prices',{exact:true}).isVisible());
  await page.waitForFunction(key => document.querySelectorAll('[data-reading-page][data-status=read]').length===5 && Object.values(JSON.parse(localStorage.getItem(key)).pages).every(p => !p.needsMerge),key);
  await page.evaluate(() => { window.readingChip=document.querySelector('[data-reading-page][data-status=detailing]'); });
  await bothWidths(page,'reading',true);
  await delay(1100);
  assert.ok(await page.evaluate(() => window.readingChip.isConnected),'timer updates keep chip nodes in place');
  const preliminary=(await readState(page)).flyers.find(f => f.pageIds.includes(marketId));
  await page.waitForFunction(() => document.querySelector('#reading-progress')?.max===13);
  detail.release(); last.release(); await finished(page);
  const sorted=await readState(page), market=sorted.flyers.find(f => f.pageIds.includes(marketId));
  assert.equal(sorted.flyers.length,6); assert.equal(market.id,preliminary.id); assert.equal(market.items[0].price_yen,158); assert.equal(market.items.length,3);
  assert.equal(sorted.pages[marketId].tiles.length,7); assert.equal(sorted.pages[marketId].detailed,true);
  assert.deepEqual(reads.filter(r => r.pageId===marketId).map(r => [r.mode,r.tiles.length]),[['page',1],['tiles',6]]);
  assert.ok(reads.filter(r => r.mode==='tiles').every(r => r.pageId===marketId));
  await page.getByRole('heading',{name:'3 places worth the walk',exact:true}).waitFor();
  assert.match(await page.locator('.cw-stop-list').textContent(),/Trial ¥1,000 was ¥3,300/);
  assert.ok(await page.locator('.cw-stop-list .cw-sticker').count()>0,'printed prices have a sticker');
  await ticketChecks(page);
  assert.equal(await page.locator('.cw-stop-list img[src^="blob:"]').count(),4);
  assert.equal(await page.locator('.cw-stop-list img[src=x]').count(),0,'model markup is escaped');
  const keep=sorted.flyers.find(f => f.bucket==='keep'); assert.deepEqual(Object.keys(keep).sort(),['bucket','category','id','pageIds']);
  assert.ok(keep.pageIds.every(id => !sorted.pages[id])); assert.deepEqual(await rows(page),[]);
  await page.waitForFunction(() => new Promise(resolve => { const r=indexedDB.open('worth-the-walk-photos',2); r.onsuccess=() => { const db=r.result, tx=db.transaction('thumbs','readonly'), q=tx.objectStore('thumbs').count(); tx.oncomplete=() => { db.close(); resolve(q.result===6); }; }; }));
  const retained=await rows(page,'thumbs'); assert.ok(keep.pageIds.every(id => !retained.some(t => t.pageId===id)));
  assert.ok(!/data:image|blob:/.test(JSON.stringify(sorted)),'no photos or object URLs in localStorage');
  assert.ok(await page.locator('.cw-stop-list img').evaluateAll(imgs => imgs.every(i => Math.max(i.naturalWidth,i.naturalHeight)<=480)));
  for (const [id,label,description] of [['home','Home','deal to use at home'],['toss','Recycle','flyer to recycle'],['keep','Keep','letter, not an ad']]) {
    const slot=page.locator(`.cw-tray [data-action=bucket-sheet][data-id=${id}]`);
    assert.equal(await slot.locator('em').textContent(),label);
    assert.equal(await slot.locator('b').textContent(),'1');
    assert.equal(await slot.locator('span').textContent(),description);
  }
  for (const bucket of ['home','toss','keep']) { await page.locator(`[data-action=bucket-sheet][data-id=${bucket}]`).click(); await page.locator('#sheet[open]').waitFor(); await bothWidths(page,bucket+'-sheet'); if (bucket==='home') assert.match(await page.locator('#sheet a[href^="tel:"]').getAttribute('href'),/^tel:\d+$/); if (bucket==='keep') { assert.equal(await page.locator('#sheet img').count(),0); assert.ok(await page.getByText('Nothing from these was saved.',{exact:true}).isVisible()); } await page.getByRole('button',{name:'Close sheet',exact:true}).click(); }
  await bothWidths(page,'answer',true);
  assert.equal(await page.locator('.cw-mailbox-tray').count(),1);
  await page.locator('.cw-answer .cw-mailbox-tray').waitFor({state:'visible'});
  await resize(page,{width:1280,height:900});
  await page.locator('.cw-home-side .cw-mailbox-tray').waitFor({state:'visible'});
  assert.ok(await page.locator('.cw-home-side [data-action=choose-photos]').evaluate(el => { const primary=el.parentElement.querySelector('[data-action=take-photo]').getBoundingClientRect(), r=el.getBoundingClientRect(); return Math.abs(r.left-primary.left)<1 && Math.abs(r.width-primary.width)<1; }),'photo chooser aligns under its button');
  await resize(page,{width:390,height:844});
  const dojo=sorted.flyers.find(f => f.category==='lesson'), dojoRow=page.locator(`[data-flyer="${dojo.id}"]`);
  await dojoRow.locator('[data-action=flyer-sheet]').click(); await page.locator('#sheet[open]').waitFor();
  await page.getByRole('heading',{name:'How to use',exact:true}).waitFor(); assert.match(await page.locator('#sheet').textContent(),/This photo shows 3 flyers/);
  assert.equal(await page.locator('#sheet .cw-value').count(),0);
  assert.ok(await page.locator('#sheet .cw-entry .cw-meta').count()>0);
  assert.ok(await page.locator('#sheet .cw-entry').evaluateAll(rows => rows.every(row => row.querySelectorAll('.cw-meta').length<=1 && getComputedStyle(row).borderTopStyle==='dashed')),'entries have one printed meta line and dashed rules');
  await bothWidths(page,'flyer-sheet',true);
  await page.locator('#sheet .cw-page-tile').first().click(); await page.getByRole('heading',{name:'This page',exact:true}).waitFor();
  await page.keyboard.press('Escape'); await page.getByRole('heading',{name:'How to use',exact:true}).waitFor();
  assert.equal(await page.locator('#sheet .cw-page-tile').first().evaluate(el => el===document.activeElement),true,'nested page returns focus to its flyer');
  await page.keyboard.press('Escape'); await page.locator('#sheet[open]').waitFor({state:'detached'});
  // A dialog fires its close event after the open attribute is removed, so focus returns a moment later.
  await page.waitForFunction(id => document.activeElement?.matches(`[data-flyer="${id}"] [data-action=flyer-sheet]`),dojo.id,{timeout:3000});
  const moving=dojo.pageIds[0];
  await dojoRow.locator(`[data-action=page-sheet][data-id="${moving}"]`).click(); await page.getByRole('heading',{name:'This page',exact:true}).waitFor();
  assert.match(await page.locator('#sheet img.cw-preview').getAttribute('src'),/^blob:/); assert.ok(await page.getByText('This page belongs to:',{exact:true}).isVisible());
  assert.equal(await page.locator(`#sheet input[value="${keep.id}"]`).count(),0,'private mail is never a grouping target');
  await bothWidths(page,'page-sheet',true);
  await page.locator(`#sheet input[name=belongs][value="${market.id}"]`).check(); await page.getByRole('button',{name:'Apply',exact:true}).click(); await page.locator('#sheet[open]').waitFor({state:'detached',timeout:60000});
  const moved=await readState(page), movedMarket=moved.flyers.find(f => f.pageIds.includes(marketId)), movedDojo=moved.flyers.find(f => f.category==='lesson');
  assert.ok(movedMarket.pageIds.includes(moving)); assert.equal(movedMarket.pageIds.length,2); assert.equal(movedDojo.pageIds.length,1);
  assert.equal(new Set(moved.flyers.map(f => f.id)).size,moved.flyers.length,'regrouping never duplicates flyer IDs');
  assert.equal(await page.locator(`[data-flyer="${movedMarket.id}"] img`).count(),2,'stack updates after Apply');
  const rejected=moved.flyers.find(f => f.category==='fitness'); await page.locator(`[data-flyer="${rejected.id}"] [data-action=not-for-me]`).click();
  await page.locator(`[data-flyer="${rejected.id}"]`).waitFor({state:'detached'}); assert.equal((await readState(page)).labels[rejected.id],0);
  // A mis-tap can be undone from the toast; the place comes back with its old label.
  await page.locator('#notice').getByRole('button',{name:'Undo',exact:true}).click();
  await page.locator(`[data-flyer="${rejected.id}"]`).waitFor(); assert.equal((await readState(page)).labels[rejected.id],undefined);
  assert.equal(await page.locator('#notice').isVisible(),false,'Undo clears its toast');
  await page.locator(`[data-flyer="${rejected.id}"] [data-action=not-for-me]`).click();
  await page.locator(`[data-flyer="${rejected.id}"]`).waitFor({state:'detached'}); assert.equal((await readState(page)).labels[rejected.id],0);
  await page.getByRole('button',{name:'Start the walk →',exact:true}).click(); await page.locator('.cw-walk-mode').waitFor();
  await lineChecks(page);
  await bothWidths(page,'walk',true);
  assert.match(await page.getByRole('link',{name:'Open route in Google Maps',exact:true}).getAttribute('href'),/travelmode=walking/);
  await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor(); await page.locator('.cw-walk-mode').waitFor();
  let state=await readState(page), outing=active(state); assert.equal(outing.cursor,0); assert.equal(outing.stopIds.length,2);
  // Demo locations hash random page ids, so the walk order varies. The split page has no offer; walk the stop with one first.
  const usable=id => { const f=state.flyers.find(f => f.id===id); return (f?.offers?.length ?? 0)+(f?.items?.length ?? 0)>0; };
  if (!usable(outing.stopIds[0]) && usable(outing.stopIds[1])) {
    await page.evaluate(key => { const s=JSON.parse(localStorage.getItem(key)); s.outings.find(o => o.status==='active').stopIds.reverse(); localStorage.setItem(key,JSON.stringify(s)); },key);
    await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor(); await page.locator('.cw-walk-mode').waitFor(); state=await readState(page); outing=active(state);
  }
  const first=state.flyers.find(f => f.id===outing.stopIds[0]); await context.setGeolocation({latitude:first.location.lat,longitude:first.location.lon,accuracy:1});
  await page.evaluate(() => {
    window.stampVibrations=[];
    Object.defineProperty(navigator,'vibrate',{configurable:true,value:duration => { window.stampVibrations.push(duration); return true; }});
    const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition=(...args) => { window.releaseStampLocation=() => original(...args); };
  });
  await page.getByRole('button',{name:"I'm here",exact:true}).click();
  assert.equal(await page.locator('[data-action=here]').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('[data-action=here]').textContent(),'Checking location…');
  assert.equal(await page.locator('.cw-spinner').evaluate(el => getComputedStyle(el).animationName),'none','reduced motion keeps the spinner still');
  await page.evaluate(() => window.releaseStampLocation()); await page.locator('.cw-stamp.gps').waitFor();
  assert.equal(await page.locator('.cw-stamp-label').textContent(),'Stamp 1 of 2 · GPS checked');
  assert.match(await page.locator('#announce').textContent(),/^Stamped: /);
  assert.equal(await page.getByRole('heading',{name:'Did you use it?',exact:true}).evaluate(el => el===document.activeElement),true);
  assert.deepEqual(await page.evaluate(() => window.stampVibrations),[18],'one short vibration per GPS stamp');
  await lineChecks(page);
  await sealChecks(page); await bothWidths(page,'stamped-stop',true);
  assert.equal(await page.locator('#stamps-button').getAttribute('aria-label'),'Your stamps');
  assert.equal(await page.locator('#stamps-button .cw-stamp-count').textContent(),'1');
  assert.equal(await page.locator('#stamps-button .cw-stamp-count').getAttribute('aria-hidden'),'true');
  assert.equal((await readState(page)).labels[first.id],1); assert.ok(await page.getByRole('heading',{name:'Did you use it?',exact:true}).isVisible());
  // Walk order varies with the demo locations, so pick the chip with the highest printed value (a stop may have none).
  const chips=await page.locator('[data-action=used]').evaluateAll(els => els.map(el => ({kind:el.dataset.kind,index:Number(el.dataset.index)})));
  assert.ok(chips.length>0,'a stamped stop always offers something to mark as used');
  const pick=chips.map((c,i) => ({...c,i,value:printedValue(first[c.kind==='offer' ? 'offers' : 'items'][c.index])})).sort((a,b) => (b.value ?? -1)-(a.value ?? -1))[0];
  const used=page.locator('[data-action=used]').nth(pick.i), expectedYen=pick.value ?? 0;
  await used.click(); assert.equal(await used.getAttribute('aria-pressed'),'true');
  assert.equal(await used.evaluate(el => el===document.activeElement),true,'used chip keeps focus after rendering');
  assert.doesNotMatch(await used.getAttribute('aria-label'),/^✓/,'chip accessible names start with the item');
  if (expectedYen>0) {
    assert.equal(await page.locator('.cw-walk-savings').textContent(),`¥${expectedYen.toLocaleString('en-US')} saved on this walk · printed on the flyer`);
    assert.ok(await used.locator('.cw-chip-price').isVisible());
    await used.click(); assert.equal(await used.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('.cw-walk-savings').count(),0,'zero savings stays hidden');
    await used.click(); assert.ok(await page.locator('.cw-walk-savings').isVisible());
  } else assert.equal(await page.locator('.cw-walk-savings').count(),0,'unpriced use adds no yen');
  await page.getByRole('button',{name:'Next stop →',exact:true}).click();
  await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor(); state=await readState(page); outing=active(state); assert.equal(outing.cursor,1); assert.equal(outing.used.length,1);
  const second=state.flyers.find(f => f.id===outing.stopIds[1]); await context.setGeolocation({latitude:second.location.lat+650/111320,longitude:second.location.lon,accuracy:1});
  await page.getByRole('button',{name:"I'm here",exact:true}).click(); await page.getByText(/You're \d+ m away — keep walking/).waitFor();
  assert.equal(await page.locator('.cw-stamp-arrival .cw-stamp').count(),0);
  assert.equal(await page.locator('.cw-far').getAttribute('role'),'status');
  assert.ok(await page.locator('.cw-far').getByRole('link',{name:'Open route in Google Maps',exact:true}).isVisible());
  assert.ok(await page.getByText('Stamp anyway gives a dashed stamp.',{exact:true}).isVisible());
  await bothWidths(page,'walk-far',true);
  await page.getByRole('button',{name:'Stamp anyway',exact:true}).click(); await page.locator('.cw-stamp.self').waitFor();
  assert.equal(await page.locator('.cw-stamp-label').textContent(),'Stamp 2 of 2 · without GPS');
  assert.match(await page.locator('#announce').textContent(),/^Stamped: /);
  await lineChecks(page);
  const resultHeading=page.locator('.cw-used h2');
  assert.equal(await (await resultHeading.count() ? resultHeading : page.locator('[data-action=next-stop]')).evaluate(el => el===document.activeElement),true);
  await page.getByRole('button',{name:'Next stop →',exact:true}).click();
  await page.getByRole('heading',{name:'Walk done',exact:true}).waitFor();
  assert.equal(await page.locator('.cw-done .cw-ticket').count(),1,'done is a used ticket');
  assert.equal(await page.locator('.cw-finished-seal').getAttribute('aria-hidden'),'true');
  assert.equal(await page.locator('.cw-finished-seal .mark').textContent(),'済');
  assert.equal(await page.locator('.cw-finished-seal textPath').textContent(),'WORTH THE WALK');
  assert.match(await page.locator('.cw-done .cw-tally').textContent(),/2stamps collected.*km.*~[\d,]+steps · estimate.*~\d+kcal · estimate/);
  assert.ok(await page.getByRole('button',{name:'Back to my mailbox',exact:true}).isVisible());
  // Sharing a walk sends text only: distance, places and printed savings, never shop names or places.
  if (await page.getByRole('button',{name:'Share this walk',exact:true}).count()) {
    await page.evaluate(() => { window.sharedWalk=null; navigator.share=data => { window.sharedWalk=data; return Promise.resolve(); }; });
    await page.getByRole('button',{name:'Share this walk',exact:true}).click(); await page.waitForFunction(() => window.sharedWalk);
    const shared=await page.evaluate(() => window.sharedWalk), names=(await readState(page)).flyers.map(f => f.business?.name).filter(Boolean);
    assert.match(shared.text,/^I walked [\d.]+ km to 2 places from the flyers in my mailbox/); assert.equal(shared.url,base+'/');
    assert.ok(names.every(name => !shared.text.includes(name)),'shared text has no shop names');
  }
  await sealChecks(page);
  if (expectedYen>0) {
    assert.match(await page.locator('.cw-done-summary').textContent(),new RegExp(`¥${expectedYen.toLocaleString('en-US')} saved.*printed on the flyers`));
    assert.equal(await page.locator('.cw-done-summary > span').textContent(),'printed on the flyers');
    assert.ok(await page.locator('.cw-done-summary').evaluate(el => { const money=el.querySelector('strong'),suffix=el.querySelector('span'); return getComputedStyle(money).whiteSpace==='nowrap' && money.getBoundingClientRect().bottom<=suffix.getBoundingClientRect().top; }),'done savings and printed suffix use separate lines');
  }
  const done=(await readState(page)).outings.at(-1); assert.equal(done.status,'done'); assert.equal(done.stamps.length,2); assert.equal(savings(done.used.map(u => ({entry:state.flyers.find(f => f.id===u.flyerId)[u.kind==='offer' ? 'offers' : 'items'][u.index]}))).yen,expectedYen);
  assert.equal(await page.locator('#stamps-button .cw-stamp-count').textContent(),'2');
  await bothWidths(page,'done',true); await page.locator('.cw-done').getByRole('button',{name:'See your stamp card',exact:true}).click(); await page.locator('#sheet[open]').waitFor();
  assert.ok(await page.locator('.cw-month-rally').getByText('Stamp rally · October',{exact:true}).isVisible());
  assert.equal(await page.locator('.cw-spot-mark').textContent(),'歩');
  assert.equal(await page.locator('#sheet [data-stamp]').count(),2); assert.equal(await page.locator('#sheet [data-history-flyer]').count(),5);
  assert.equal(await page.locator('.cw-month-rally .cw-rally > *').count()%3,0,'stamp rally has full rows');
  await sealChecks(page);
  await page.locator('#sheet [data-history-flyer] [data-action=flyer-sheet]').first().click(); await page.getByRole('heading',{name:'How to use',exact:true}).waitFor();
  await page.keyboard.press('Escape'); await page.getByRole('heading',{name:'Your stamps',exact:true}).waitFor();
  assert.equal(await page.locator('#sheet [data-history-flyer] [data-action=flyer-sheet]').first().evaluate(el => el===document.activeElement),true,'flyer returns focus to Your stamps');
  await bothWidths(page,'stamps',true); await page.getByLabel('Search flyers',{exact:true}).fill('Pilates studio'); assert.equal(await page.locator('#sheet [data-history-flyer]').count(),1);
  await page.keyboard.press('Escape'); await page.reload(); await page.getByText('Demo mode',{exact:true}).waitFor(); await page.getByRole('heading',{name:'Walk done',exact:true}).waitFor();
  assert.equal((await readState(page)).outings.at(-1).stamps.length,2); await page.locator('#stamps-button').click(); assert.equal(await page.locator('#sheet [data-stamp]').count(),2); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back to my mailbox',exact:true}).click(); await page.locator('.cw-snap').waitFor(); await bothWidths(page,'returned-mailbox');
  // Use the same saved mailbox to inspect both dark screens without additional reads.
  const dark=await newPhone({colorScheme:'dark'});
  await dark.page.addInitScript(({key,state}) => localStorage.setItem(key,JSON.stringify(state)),{key,state:{...await readState(page),settings:{...(await readState(page)).settings,theme:'dark'},outings:[]}});
  await open(dark.page); await copyThumbs(page,dark.page); await dark.page.reload(); await dark.page.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal(await dark.page.locator('.cw-start, #setup[open]').count(),0,'saved station state needs no chooser');
  await dark.page.locator('.cw-ticket').waitFor(); await ticketChecks(dark.page);
  assert.ok(await dark.page.locator('.cw-ticket .cw-thumb[src^="blob:"]').count()>0,'dark screenshots retain the photographed flyers');
  assert.notEqual(await dark.page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await bothWidths(dark.page,'answer-dark',true);
  await dark.page.getByRole('button',{name:'Start the walk →',exact:true}).click(); await dark.page.locator('.cw-walk-mode').waitFor();
  assert.notEqual(await dark.page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await bothWidths(dark.page,'walk-dark',true); await dark.context.close();
  await context.close();
  // Reload during the initial read, then resume the pending full JPEGs.
  const recovery=await newPhone(), waitWhole=gate(), seenRecovery=new Map(); let holdWhole=true;
  await interceptRead(recovery.page,async request => { seenRecovery.set(request.pageId,(seenRecovery.get(request.pageId) ?? 0)+1); if (holdWhole) await waitWhole.promise; return structuredClone(fixture[0]); });
  await setup(recovery.page); await select(recovery.page,await files(recovery.page,3)); await recovery.page.getByRole('button',{name:'Read 3 flyers',exact:true}).click();
  await chooseStart(recovery.page);
  await recovery.page.locator('#reading-progress').waitFor(); assert.equal((await rows(recovery.page)).length,3);
  await recovery.page.reload(); await recovery.page.getByText('Demo mode',{exact:true}).waitFor(); await recovery.page.getByText(/3 pages waiting from/).waitFor();
  await bothWidths(recovery.page,'resume'); holdWhole=false; waitWhole.release();
  await recovery.page.getByRole('button',{name:'Resume',exact:true}).click(); await finished(recovery.page); assert.deepEqual(await rows(recovery.page),[]);
  assert.ok((await readState(recovery.page)).flyers.length>0); await recovery.context.close();

  // A failed detail pass preserves the preliminary stop and resumes without rereading the whole page.
  const adaptive=await newPhone(); let failDetail=true, failMerge=false, adaptiveId, wholeCalls=0, detailCalls=0;
  await interceptRead(adaptive.page,async (request,route) => {
    adaptiveId=request.pageId;
    if (request.mode==='page') { wholeCalls++; const tile=structuredClone(fixture[2]); tile.items[0].price_yen=999; return tile; }
    detailCalls++;
    if (failDetail) { await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic detail outage'})}); return null; }
    return structuredClone(fixture[2]);
  });
  await adaptive.page.route('**/api/merge',async route => { if (failMerge) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic merge outage'})}); else await route.continue(); });
  await setup(adaptive.page); await select(adaptive.page,await files(adaptive.page,1)); await adaptive.page.getByRole('button',{name:'Read 1 flyer',exact:true}).click();
  await chooseStart(adaptive.page);
  await adaptive.page.getByRole('button',{name:'Retry page 1',exact:true}).waitFor(); const beforeDetail=await readState(adaptive.page);
  assert.equal(beforeDetail.pages[adaptiveId].detailPending,true); assert.equal(beforeDetail.flyers.length,1); assert.equal(beforeDetail.flyers[0].items[0].price_yen,999); assert.equal((await rows(adaptive.page)).length,1);
  await bothWidths(adaptive.page,'detail-error'); await adaptive.page.reload(); await adaptive.page.getByText('Demo mode',{exact:true}).waitFor(); await adaptive.page.getByText(/1 pages waiting from/).waitFor();
  failDetail=false; failMerge=true; await adaptive.page.getByRole('button',{name:'Resume',exact:true}).click(); await finished(adaptive.page);
  assert.equal(wholeCalls,1,'successful whole-page read is not repeated on reload'); assert.equal(detailCalls,2);
  const detailSaved=await readState(adaptive.page); assert.equal(detailSaved.pages[adaptiveId].detailed,true); assert.equal(detailSaved.pages[adaptiveId].detailPending,false); assert.equal(detailSaved.pages[adaptiveId].needsMerge,true);
  failMerge=false; await adaptive.page.getByRole('button',{name:'Retry sorting saved readings',exact:true}).click();
  await adaptive.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).flyers[0].items[0].price_yen===158,key);
  assert.equal((await readState(adaptive.page)).flyers[0].id,beforeDetail.flyers[0].id); assert.deepEqual(await rows(adaptive.page),[]); await adaptive.context.close();

  // Address lookup, distant/train starts, long budgets, top-five entries, safe links and implicit TabPFN attribution.
  const extra=await newPhone(); await setup(extra.page); await settingsStation(extra.page);
  const hikifune=stationsOnLine(stations,'skytree').find(s => s.name==='Hikifune'); assert.ok(hikifune);
  const hikifunePoint=coordinates.find(p => p.id===hikifune.id);
  await extra.page.evaluate(({key,tile,market,homePoint,hikifunePoint}) => {
    const s=JSON.parse(localStorage.getItem(key)), make=(id,base,location) => ({...structuredClone(base),id,pageIds:[id+'-page'],bucket:'walk',deadline:'2026-11-30',location});
    const distant=make('train-stop',tile,{...hikifunePoint,source:'mock'}); distant.business={name:'Fictional Hikifune studio',kind:'Pilates studio'}; distant.offers=[{kind:'discount',text_en:'Trial',text_ja:'体験',regular_yen:3300,offer_yen:1000,deadline_text:'2026-11-30'}];
    distant.websites=['https://example.test','javascript:alert(1)','data:text/html,bad','ftp://example.test'];
    distant.offers.push({kind:'coupon',text_en:'Expired hidden',discount_yen:900,deadline_text:'2026-01-01'});
    distant.items=Array.from({length:8},(_,i) => ({name_en:'Printed item '+i,name_ja:'品 '+i,regular_yen:1000+i*100,price_yen:100,conditions:[]}));
    const missing=make('unlocated',tile,null); missing.business={name:'Fictional studio with no address',kind:'fitness studio'};
    const near=make('near-stop',market,{lat:homePoint.lat+0.001,lon:homePoint.lon,source:'mock'}); near.business.name='Fictional market'; near.hours=null;
    s.flyers=[distant,missing,near]; s.labels={}; s.outings=[]; localStorage.setItem(key,JSON.stringify(s));
  },{key,tile:fixture[0],market:fixture[2],homePoint,hikifunePoint});
  await extra.page.reload(); await extra.page.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal(await extra.page.locator('.cw-start, #setup[open]').count(),0);
  const noLocation=extra.page.locator('[data-flyer=unlocated]'); await noLocation.getByRole('button',{name:'Add address',exact:true}).click();
  await extra.page.route('**/api/locate?*',async route => { assert.equal(new URL(route.request().url()).searchParams.get('q'),'Fictional printed address'); await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({location:{lat:homePoint.lat+0.002,lon:homePoint.lon,source:'mock'}})}); });
  await noLocation.getByLabel('Printed address',{exact:true}).fill('Fictional printed address'); await noLocation.getByRole('button',{name:'Find address',exact:true}).click();
  await extra.page.getByText('Location found. Your walk has been updated.',{exact:true}).waitFor(); assert.ok((await readState(extra.page)).flyers.find(f => f.id==='unlocated').location);
  await extra.page.locator('[data-flyer=train-stop] [data-action=flyer-sheet]').click();
  assert.equal(await extra.page.locator('#sheet [data-item-index]').count(),5); assert.equal(await extra.page.locator('#sheet [data-item-index]').first().getAttribute('data-item-index'),'7');
  assert.equal(await extra.page.getByText('Expired hidden',{exact:true}).count(),0); assert.equal(await extra.page.locator('#sheet a[href^="javascript:"],#sheet a[href^="data:"],#sheet a[href^="ftp:"]').count(),0);
  await extra.page.getByRole('button',{name:'Show all',exact:true}).click(); assert.equal(await extra.page.locator('#sheet [data-item-index]').count(),8); await bothWidths(extra.page,'dense-flyer'); await extra.page.keyboard.press('Escape');
  // Removing the nearby candidates makes the existing station-to-station train option visible.
  for (const id of ['near-stop','unlocated']) await extra.page.locator(`[data-flyer=${id}] [data-action=not-for-me]`).click();
  await extra.page.getByText(/Take the train to Hikifune, then walk/).waitFor();
  const kanegafuchiPoint=coordinates.find(s => s.id==='kanegafuchi');
  await extra.page.evaluate(({key,point}) => {
    const s=JSON.parse(localStorage.getItem(key));
    s.flyers.find(f => f.id==='train-stop').location={lat:point.lat,lon:point.lon,source:'mock'};
    s.flyers.find(f => f.id==='near-stop').location={lat:point.lat+0.024,lon:point.lon,source:'mock'};
    s.labels['near-stop']=1; s.settings.maxMinutes=40; localStorage.setItem(key,JSON.stringify(s));
  },{key,point:kanegafuchiPoint});
  await extra.page.reload(); await extra.page.getByText('Demo mode',{exact:true}).waitFor();
  await extra.page.locator('.cw-dropped').waitFor(); await bothWidths(extra.page,'dropped-stops');
  await extra.page.getByRole('button',{name:'Make it 60 min',exact:true}).click();
  assert.equal((await readState(extra.page)).settings.maxMinutes,60);
  await extra.page.locator('.cw-dropped').waitFor({state:'detached'});
  await extra.page.locator('#settings-button').click(); await extra.page.getByLabel('60 min',{exact:true}).check(); await extra.page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal((await readState(extra.page)).settings.maxMinutes,60);
  await extra.page.locator('#settings-button').click(); await extra.page.getByLabel('90 min',{exact:true}).check(); await extra.page.getByRole('button',{name:'Save',exact:true}).click();
  await extra.page.reload(); await extra.page.getByText('Demo mode',{exact:true}).waitFor(); assert.equal((await readState(extra.page)).settings.maxMinutes,90);
  await extra.page.route('**/api/rank',async route => { const body=route.request().postDataJSON(); assert.equal(body.train.length,6); assert.deepEqual(new Set(body.train.map(t => t.label)),new Set([0,1])); await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:'tabpfn',scores:body.predict.map((f,i) => ({id:f.id,p:1-i*.1}))})}); });
  await extra.page.evaluate(key => { const s=JSON.parse(localStorage.getItem(key)); for (let i=0;i<3;i++) { const f=structuredClone(s.flyers[0]); f.id='ranking-ad-'+i; f.bucket='toss'; s.flyers.push(f); } s.flyers.forEach((f,i) => { s.labels[f.id]=i%2; }); localStorage.setItem(key,JSON.stringify(s)); },key);
  await extra.page.reload(); await extra.page.getByText('Ordered for you by TabPFN',{exact:true}).waitFor(); assert.equal(await extra.page.getByText(/Rate 6 flyers/).count(),0); await bothWidths(extra.page,'ranked-answer'); await extra.context.close();

  // Upgrade preserves v1 pending photos; unavailable IndexedDB uses neutral tiles.
  const upgrade=await newPhone(); await open(upgrade.page);
  await upgrade.page.evaluate(async () => {
    await new Promise((resolve,reject) => { const r=indexedDB.deleteDatabase('worth-the-walk-photos'); r.onsuccess=resolve; r.onerror=() => reject(r.error); });
    await new Promise((resolve,reject) => { const r=indexedDB.open('worth-the-walk-photos',1); r.onupgradeneeded=() => r.result.createObjectStore('pages',{keyPath:'pageId'}); r.onerror=() => reject(r.error); r.onsuccess=() => { const db=r.result, tx=db.transaction('pages','readwrite'); tx.objectStore('pages').put({pageId:'v1-page',blob:new Blob(['synthetic JPEG'],{type:'image/jpeg'}),addedAt:'2026-10-11T02:00:00Z',rotation:0,status:'waiting'}); tx.oncomplete=() => { db.close(); resolve(); }; }; });
  });
  await upgrade.page.reload(); await upgrade.page.getByText('Demo mode',{exact:true}).waitFor(); assert.equal((await rows(upgrade.page)).length,1); assert.deepEqual(await rows(upgrade.page,'thumbs'),[]); await upgrade.context.close();
  const unavailable=await newPhone(); await unavailable.page.addInitScript(() => Object.defineProperty(window,'indexedDB',{get() { throw new Error('Synthetic unavailable storage'); }}));
  await setup(unavailable.page); await interceptRead(unavailable.page,async () => structuredClone(fixture[0])); await select(unavailable.page,await files(unavailable.page,1)); await unavailable.page.getByRole('button',{name:'Read 1 flyer',exact:true}).click(); await chooseStart(unavailable.page); await finished(unavailable.page);
  assert.equal(await unavailable.page.locator('.cw-stop-row img').count(),0); assert.equal(await unavailable.page.locator('.cw-stop-row .cw-placeholder').count(),1); await bothWidths(unavailable.page,'placeholder-answer'); await unavailable.context.close();

  // A new visitor can try the complete loop locally, then read real mail with a GPS start.
  const sample=await newPhone({colorScheme:'light',geolocation:{latitude:homePoint.lat,longitude:homePoint.lon,accuracy:1}}), sampleCalls=[];
  sample.page.on('request',request => { if (/\/api\/(read-page|merge|locate|rank)(?:\?|$)/.test(request.url())) sampleCalls.push(request.url()); });
  await sample.page.addInitScript(() => {
    window.startLocations=[];
    const get=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition=(success,error,options) => { window.startLocations.push(options); get(success,error,options); };
  });
  await setup(sample.page);
  await sample.page.getByRole('button',{name:'Try a sample mailbox',exact:true}).click();
  await sample.page.getByRole('heading',{name:'Where do you start walking?',exact:true}).waitFor();
  await bothWidths(sample.page,'start-chooser');
  await sample.page.getByRole('button',{name:'Use my location',exact:true}).click();
  await sample.page.getByRole('heading',{name:'4 places worth the walk',exact:true}).waitFor();
  assert.deepEqual(await sample.page.evaluate(() => window.startLocations),[{enableHighAccuracy:false,timeout:15000,maximumAge:600000}],'start uses one coarse, cached GPS reading');
  const sampleState=await readState(sample.page);
  assert.deepEqual(sampleState.settings.place,{lat:Number(homePoint.lat.toFixed(4)),lon:Number(homePoint.lon.toFixed(4))});
  assert.equal(sampleState.settings.home,null); assert.equal(sampleState.settings.lineId,null); assert.equal(sampleState.settings.maxMinutes,40);
  assert.equal(sampleState.flyers.length,8); assert.ok(sampleState.flyers.every(f => f.sample)); assert.deepEqual(sampleState.pages,{});
  assert.deepEqual(Object.keys(sampleState.flyers.find(f => f.bucket==='keep')).sort(),['bucket','category','id','pageIds','sample']);
  assert.ok(await sample.page.getByText('Made-up shops placed near your start.',{exact:true}).isVisible());
  await sample.page.waitForFunction(() => [...document.querySelectorAll('.cw-home img')].every(i => i.complete && i.naturalWidth>0));
  assert.equal(await sample.page.locator('.cw-home img[src^="blob:"]').count(),7);
  assert.ok(await sample.page.locator('.cw-home img').evaluateAll(imgs => imgs.every(i => Math.max(i.naturalWidth,i.naturalHeight)===480)));
  assert.equal(await sample.page.locator('[data-action=page-sheet], [data-action=merge-retry]').count(),0,'drawn previews cannot open pages or become saved readings');
  for (const [bucket,count] of [['home',1],['toss',2],['keep',1]]) assert.equal(await sample.page.locator(`.cw-tray [data-id=${bucket}] > b`).textContent(),String(count));
  assert.equal(await sample.page.locator('.cw-route-station .cw-station').first().textContent(),'From where you are');
  assert.equal(await sample.page.locator('.cw-route-end .cw-station').textContent(),'Back to where you started');
  assert.deepEqual(sampleCalls,[],'sample creation makes no model, merge, locate or ranking requests');
  assert.equal((await rows(sample.page,'thumbs')).filter(t => t.pageId.startsWith('sample-')).length,7); assert.deepEqual(await rows(sample.page),[]);
  await ticketChecks(sample.page); await bothWidths(sample.page,'sample',true);
  // A persisted sample may contain a made-up website as well as its phone number.
  await sample.page.evaluate(key => { const s=JSON.parse(localStorage.getItem(key)); for (const f of s.flyers.filter(f => f.sample && f.bucket !== 'keep')) f.websites=['https://sample.invalid']; localStorage.setItem(key,JSON.stringify(s)); },key);
  await sample.page.reload(); await sample.page.getByText('Demo mode',{exact:true}).waitFor();
  assert.equal((await readState(sample.page)).flyers.filter(f => f.sample).length,8,'sample marker survives reload, including the letter');
  assert.equal(await sample.page.locator('.cw-home img[src^="blob:"]').count(),7);
  await sample.page.locator('#stamps-button').click();
  for (const f of sampleState.flyers.filter(f => f.bucket !== 'keep')) {
    await sample.page.locator(`#sheet [data-history-flyer="${f.id}"] [data-action=flyer-sheet]`).click();
    await sampleLinkChecks(sample.page.locator('#sheet[open]'));
    assert.ok(await sample.page.getByText('Made-up shop — nothing to call.',{exact:true}).isVisible());
    await sample.page.keyboard.press('Escape');
  }
  await sample.page.keyboard.press('Escape');
  await sample.page.locator('.cw-tray [data-id=home]').click();
  await sampleLinkChecks(sample.page.locator('#sheet[open]'));
  assert.equal(await sample.page.locator('#sheet').getByRole('link',{name:'Call',exact:true}).count(),0);
  await sample.page.keyboard.press('Escape');
  await sample.page.locator('#settings-button').click();
  assert.ok(await sample.page.getByText('Starting from your location',{exact:true}).isVisible());
  assert.equal(await sample.page.locator('#setup-weight').isVisible(),false);
  await sample.page.getByRole('button',{name:'Save',exact:true}).click();
  assert.deepEqual((await readState(sample.page)).settings.place,sampleState.settings.place,'Save preserves the active GPS start');
  await sample.page.getByRole('button',{name:'Start the walk →',exact:true}).click();
  await sample.page.getByText("This place is made up. Tap I'm here, then Stamp anyway to try a stamp.",{exact:true}).waitFor();
  await lineChecks(sample.page); await sampleLinkChecks(sample.page.locator('.cw-walk-mode'));
  await sample.page.getByRole('button',{name:"I'm here",exact:true}).click();
  await sample.page.getByText(/You're \d+ m away — keep walking/).waitFor();
  await sampleLinkChecks(sample.page.locator('.cw-walk-mode'));
  await sample.page.getByRole('button',{name:'Stamp anyway',exact:true}).click(); await sample.page.locator('.cw-stamp.self').waitFor();
  const sampleOuting=active(await readState(sample.page));
  assert.equal(await sample.page.locator('.cw-stamp-label').textContent(),`Stamp 1 of ${sampleOuting.stopIds.length} · without GPS`);
  await sampleLinkChecks(sample.page.locator('.cw-walk-mode'));
  await sealChecks(sample.page);
  assert.ok(await sample.page.getByText('Tap what you used. Only printed prices count as savings.',{exact:true}).isVisible());
  await sample.page.getByRole('button',{name:'Next stop →',exact:true}).click();
  while (await sample.page.locator('.cw-walk-mode').count()) { await lineChecks(sample.page); await sampleLinkChecks(sample.page.locator('.cw-walk-mode')); await sample.page.getByRole('button',{name:'Skip this stop',exact:true}).click(); }
  assert.equal(await sample.page.locator('.cw-done-summary').count(),0,'unused sample deals do not invent savings');
  await sample.page.getByRole('button',{name:'Back to my mailbox',exact:true}).click();
  await sample.page.getByRole('button',{name:'Clear sample',exact:true}).click(); await welcome(sample.page);
  assert.equal((await readState(sample.page)).outings.length,0); assert.deepEqual((await readState(sample.page)).labels,{});
  assert.equal((await rows(sample.page,'thumbs')).filter(t => t.pageId.startsWith('sample-')).length,0);
  assert.deepEqual(sampleCalls,[],'the whole sample stamp loop stays local');
  // Six fictional stops exercise the smallest board and the no-chip focus fallback.
  const longLine=await newPhone({colorScheme:'dark',reducedMotion:'no-preference'});
  await longLine.page.addInitScript(({key,sampleState}) => {
    const s=structuredClone(sampleState), template=s.flyers.find(f => f.bucket==='walk');
    s.settings.theme='dark';
    s.flyers=Array.from({length:6},(_,i) => ({...structuredClone(template),id:'line-fixture-'+i,pageIds:[],category:i===5 ? 'supermarket' : 'lesson',business:{kind:i===5 ? 'Grocery stop' : 'Fictional practice studio',name:'Made-up shop '+(i+1)},offers:[],items:[]}));
    s.outings=[{id:'line-fixture-walk',createdAt:'2026-10-11T02:00:00Z',start:s.settings.place,end:s.settings.place,stopIds:s.flyers.map(f => f.id),meters:1000,minutes:16,mode:'walk',status:'active',cursor:3,skipped:['line-fixture-0'],stamps:[{stopId:'line-fixture-1',kind:'gps',at:'2026-10-11T02:00:00Z',distance:0}],used:[]}];
    localStorage.setItem(key,JSON.stringify(s));
    navigator.geolocation.getCurrentPosition=(_success,failure) => failure({code:1});
    window.stampVibrations=[];
    Object.defineProperty(navigator,'vibrate',{configurable:true,value:duration => { window.stampVibrations.push(duration); throw new Error('No haptics'); }});
  },{key,sampleState});
  await open(longLine.page); await lineChecks(longLine.page);
  assert.equal(await longLine.page.locator('[data-line-stop]').count(),6);
  await bothWidths(longLine.page,'six-stop-line');
  await resize(longLine.page,{width:1280,height:900});
  await longLine.page.locator('.cw-mini-route').waitFor({state:'visible'});
  assert.equal(await longLine.page.locator('.cw-mini-route [aria-current=step]').count(),1);
  await longLine.page.getByRole('button',{name:"I'm here",exact:true}).click();
  await longLine.page.locator('.cw-stamp.self').waitFor();
  assert.equal(await longLine.page.locator('.cw-stamp-label').textContent(),'Stamp 2 of 6 · without GPS','skipped stops do not count as collected stamps');
  assert.equal(await longLine.page.locator('.cw-used').count(),0);
  assert.equal(await longLine.page.getByRole('button',{name:'Next stop →',exact:true}).evaluate(el => el===document.activeElement),true,'no chips focuses Next stop');
  assert.deepEqual(await longLine.page.evaluate(() => window.stampVibrations),[],'self stamps do not vibrate');
  assert.equal(await longLine.page.locator('.cw-seal-impression').evaluate(el => getComputedStyle(el,'::before').animationName),'ink-splat');
  const originalLongLineReducedMotion=await longLine.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await longLine.page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await longLine.page.locator('.cw-seal-impression').evaluate(el => getComputedStyle(el,'::before').animationName),'none');
  assert.equal(await longLine.page.locator('.cw-seal.new').evaluate(el => getComputedStyle(el).animationName),'none');
  await longLine.page.emulateMedia({reducedMotion:originalLongLineReducedMotion ? 'reduce' : 'no-preference'});
  await longLine.context.close();
  await sample.page.locator('#settings-button').click(); await sample.page.getByLabel('Dark',{exact:true}).check(); await sample.page.keyboard.press('Escape');
  await sample.page.emulateMedia({colorScheme:'dark'}); await bothWidths(sample.page,'welcome-dark',true);
  await sample.page.getByRole('button',{name:'Try a sample mailbox',exact:true}).click();
  await sample.page.getByRole('heading',{name:'4 places worth the walk',exact:true}).waitFor();
  await bothWidths(sample.page,'sample-dark',true);
  // Real photos replace samples before their first request; server coordinates lose local precision.
  await interceptRead(sample.page,async () => structuredClone(fixture[1]));
  const mergeBefore=merges.length, locateBefore=locates.length;
  await select(sample.page,await files(sample.page,1)); await sample.page.getByRole('button',{name:'Read 1 flyer',exact:true}).click();
  await sample.page.getByText('Sample mailbox cleared.',{exact:true}).waitFor(); await finished(sample.page);
  assert.equal((await readState(sample.page)).flyers.some(f => f.sample),false);
  assert.equal((await rows(sample.page,'thumbs')).some(t => t.pageId.startsWith('sample-')),false);
  assert.ok(merges.length>mergeBefore); assert.ok(merges.slice(mergeBefore).every(m => m.home.stationId==='here' && coarse(m.home.lat) && coarse(m.home.lon)));
  await sample.page.evaluate(key => { const s=JSON.parse(localStorage.getItem(key)); s.flyers[0].location=null; localStorage.setItem(key,JSON.stringify(s)); },key);
  await sample.page.reload(); await sample.page.getByText('Demo mode',{exact:true}).waitFor();
  await sample.page.route('**/api/locate?*',route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({location:{lat:homePoint.lat+0.001,lon:homePoint.lon,source:'mock'}})}));
  await sample.page.getByRole('button',{name:'Add address',exact:true}).click(); await sample.page.getByLabel('Printed address',{exact:true}).fill('Fictional printed address');
  await sample.page.getByRole('button',{name:'Find address',exact:true}).click(); await sample.page.getByText('Location found. Your walk has been updated.',{exact:true}).waitFor();
  assert.ok(locates.length>locateBefore); assert.ok(locates.slice(locateBefore).every(l => coarse(l.lat) && coarse(l.lon)));
  // Switching to a station discards GPS, and a v1 station save still prints its start.
  await settingsStation(sample.page); assert.equal(Object.hasOwn((await readState(sample.page)).settings,'place'),false);
  await sample.page.reload(); await sample.page.getByText('Demo mode',{exact:true}).waitFor();
  assert.match(await sample.page.locator('.cw-route-station .cw-station').first().textContent(),new RegExp('^From '+station.name));
  assert.equal(await sample.page.locator('.cw-start, #setup[open]').count(),0); await sample.context.close();

  // Denied location reveals the station picker without losing the pending sample action.
  await nonHappyChecks(sampleState);
  const denied=await newPhone({permissions:[]});
  await setup(denied.page); await denied.page.getByRole('button',{name:'Try a sample mailbox',exact:true}).click();
  await denied.page.getByRole('button',{name:'Use my location',exact:true}).click();
  await denied.page.locator('.cw-start').getByText('Location is off for this site, so pick a station instead.',{exact:true}).waitFor();
  assert.ok(await denied.page.locator('#start-line').isVisible());
  assert.equal(await denied.page.locator('#start-line').evaluate(el => el===document.activeElement),true);
  await denied.page.locator('#start-line').selectOption('skytree'); await denied.page.locator('#start-station').selectOption(station.id);
  await denied.page.getByRole('button',{name:'Use this station',exact:true}).click();
  await denied.page.getByRole('heading',{name:'4 places worth the walk',exact:true}).waitFor();
  await denied.page.locator('#settings-button').click(); await denied.page.getByRole('button',{name:'Use my location',exact:true}).click();
  await denied.page.locator('#setup').getByText('Location is off for this site, so pick a station instead.',{exact:true}).waitFor();
  assert.equal(await denied.page.locator('#setup-line').evaluate(el => el===document.activeElement),true);
  await denied.context.close();

  const empty=await newPhone(); await setup(empty.page); assert.equal((await readState(empty.page)).flyers.length,0); assert.equal((await readState(empty.page)).settings.home,null); assert.equal(await empty.page.locator('#setup-station').count(),0); await bothWidths(empty.page,'empty-app');
  await empty.page.locator('#settings-button').click(); assert.equal(await empty.page.locator('#setup-weight').isVisible(),false);
  await empty.page.keyboard.press('Escape'); await empty.page.locator('#setup[open]').waitFor({state:'detached'});
  await empty.page.waitForFunction(() => document.activeElement?.id==='settings-button');
  for (const place of [{lat:91,lon:139},{lat:35,lon:-181},{lat:'35',lon:139},{lat:null,lon:139}]) {
    await empty.page.evaluate(({key,place}) => { const s=JSON.parse(localStorage.getItem(key)); s.settings.place=place; localStorage.setItem(key,JSON.stringify(s)); },{key,place});
    await empty.page.reload(); await empty.page.getByText('Demo mode',{exact:true}).waitFor();
    assert.equal(Object.hasOwn((await readState(empty.page)).settings,'place'),false,'invalid saved GPS coordinates are dropped');
  }
  await empty.page.evaluate(key => localStorage.setItem(key,'{corrupt'),key); await empty.page.reload(); await empty.page.getByText('Demo mode',{exact:true}).waitFor(); assert.equal((await readState(empty.page)).flyers.length,0); await empty.context.close();
  assert.deepEqual(errors,[],'no page errors across all screens and reload paths');
  assert.ok(merges.every(m => !m.home || typeof m.home.stationId==='string' && coarse(m.home.lat) && coarse(m.home.lon)),'stations and GPS both use coarse merge coordinates');
  assert.ok(locates.every(l => coarse(l.lat) && coarse(l.lon)),'all locate start coordinates are coarse');
  console.log('Chirashi browser: PASS · welcome → inline start → sample/photo → answer → walk · visual grouping · implicit labels · GPS/self stamps · printed savings · thumbnails/privacy · separate contexts · adaptive reading/merge recovery · train starts · 60/90 min · focus/escaping · 390/1280px · GPS request privacy · sample cleanup · station compatibility.');
  console.log('Screenshots: .impeccable/review/chirashi-{welcome,start-chooser,sample,snap,reading,settings,answer,flyer-sheet,page-sheet,walk,walk-far,stamped-stop,done,stamps,empty-walk,offline,read-failed,toast}.png and -desktop.png');
} finally {
  for (const release of releases) release();
  await browser?.close();
  if (server?.pid && server.exitCode===null) { const exited=once(server,'exit'); server.kill(); await Promise.race([exited,delay(5000)]); }
}
