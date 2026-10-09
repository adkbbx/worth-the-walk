import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {stations,stores,railLines,stationsOnLine} from '../data/catalog.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4175';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('.impeccable/review',{recursive:true});
try{
 await page.goto(base);await page.locator('.store').first().waitFor();
 for(const line of railLines){
  await page.locator('#line').selectOption(line.id);
  assert.equal(await page.locator('#station option').count(),stationsOnLine(stations,line.id).length);
  for(const station of stationsOnLine(stations,line.id)){
   await page.locator('#station').selectOption(station.id);
   const count=await page.locator('.store').count();
   assert.equal(count,Math.min(10,stores.filter(s=>s.station===station.id).length),station.id);
   assert.ok(count>=5,station.id);
   const links=await page.locator('.directions').all();
   for(const link of links)assert.match(await link.getAttribute('href'),/travelmode=walking/);
  }
 }
 assert.equal(await page.locator('#wallet input').count(),14);
 await page.locator('#wallet input[value=paypay]').check();await page.locator('#only-matches').check();
 assert.equal(await page.locator('.store').count(),0);await page.getByRole('button',{name:'Show all shops'}).click();
 await page.locator('#wallet input[value=paypay]').uncheck();
 await page.locator('#line').selectOption('nambu');await page.locator('#station').selectOption('shukugawara');
 await page.locator('#wallet input[value=dpoint]').check();await page.locator('#only-matches').check();
 assert.ok(await page.locator('.store').count()>0);
 assert.match(await page.locator('.store').first().innerText(),/d POINT/);
 assert.match(decodeURIComponent(await page.locator('.directions').first().getAttribute('href')),/神奈川県/);
 await page.locator('#wallet input[value=dpoint]').uncheck();await page.locator('#only-matches').uncheck();
 await page.locator('#line').selectOption('skytree');await page.locator('#station').selectOption('takenotsuka');
 await page.locator('#wallet input[value=vpoint]').check();await page.locator('#only-matches').check();
 assert.ok(await page.locator('.store').count()>0);assert.match(await page.locator('.store').first().innerText(),/V POINT: 1/);
 await page.locator('#visit-date').fill('2026-10-20');await page.locator('#visit-date').dispatchEvent('change');
 assert.match(await page.locator('.store').first().innerText(),/WAON POINT buys 1.5/);
 await page.locator('#wallet input[value=vpoint]').uncheck();await page.locator('#only-matches').uncheck();
 await page.locator('#line').selectOption('pilot');await page.locator('#station').selectOption('koenji');
 await page.locator('#visit-date').fill('2026-10-10');await page.locator('#visit-date').dispatchEvent('change');
 assert.ok(await page.locator('.flyer-line').count()>0,'Dated branch flyers appear');
 await page.locator('#visit-date').fill('2027-04-05');await page.locator('#visit-date').dispatchEvent('change');
 assert.match(await page.locator('article').filter({hasText:'西友高円寺店'}).innerText(),/scheduled to have ended/);
 assert.equal(await page.locator('.flyer-line').count(),0,'Expired flyers disappear');
 await page.locator('#visit-date').fill('2026-10-10');await page.locator('#visit-date').dispatchEvent('change');
 const ok=page.locator('article').filter({hasText:'オーケー 高円寺店'});await ok.locator('summary').click();
 assert.ok(await ok.getByRole('link',{name:'Point / membership rules'}).isVisible());await ok.locator('summary').click();
 if(process.env.TEST_AI==='1'){
  await page.locator('.ai-panel summary').click();await page.locator('#load-ai').click();
  await page.locator('#semantic-form').waitFor({state:'visible',timeout:240000});
  await page.locator('#offer-query').fill('Which shop gives cheaper food when I pay with banknotes?');await page.locator('#semantic-form button').click();
  await page.locator('#semantic-results article').first().waitFor({timeout:30000});
  assert.match(await page.locator('#semantic-results article').first().innerText(),/OK Club/);
  await page.locator('#line').selectOption('skytree');await page.locator('#station').selectOption('takenotsuka');
  await page.locator('#offer-query').fill('Can I spend WAON points for extra value on the twentieth?');await page.locator('#semantic-form button').click();
  await page.waitForFunction(()=>document.querySelector('#semantic-results')?.textContent.includes('Welcia'));
  assert.match(await page.locator('#semantic-results article').first().innerText(),/Welcia: the 20th/);
  await writeFile('.impeccable/review/browser-ai.txt',await page.locator('#semantic-results').innerText());
  await page.locator('.ai-panel summary').click();await page.locator('#line').selectOption('pilot');
 }
 await page.evaluate(async()=>{document.activeElement.blur();window.scrollTo({top:0,left:0,behavior:'instant'});await document.fonts.ready;});
 await page.screenshot({path:'.impeccable/review/desktop-viewport.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.activeElement.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});
 assert.equal(await page.locator('#options').getAttribute('open'),null);
 await page.screenshot({path:'.impeccable/review/mobile-viewport.png'});
 assert.ok((await page.locator('.store').first().boundingBox()).y<844,'First shop in mobile viewport');
 assert.ok(await page.locator('.condition').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=14));
 await page.locator('#options-summary').click();assert.ok(await page.locator('#visit-date').isVisible());await page.locator('#apply-options').click();
 await page.evaluate(()=>{document.activeElement.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});
 await page.screenshot({path:'.impeccable/review/mobile-viewport.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#line').selectOption('den-en-toshi');await page.locator('#station').selectOption('minami-machida');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(base+'/?station=takatsu');await page.locator('.store').first().waitFor();assert.equal(await page.locator('#line').inputValue(),'den-en-toshi');
 await page.goto(base+'/data-status.html');assert.equal(await page.locator('tbody tr').count(),74);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(base+'/evaluation.html');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Browser passed: all 74 stations, 5–10 shops, card filters, flyer expiry, Welcia date, directions, source links, mobile/desktop and data status.');
}finally{await browser.close();}
