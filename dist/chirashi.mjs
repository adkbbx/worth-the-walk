import {stations, railLines, stationsOnLine, stores} from '/catalog.mjs';
import {groupPages, storable, printedValue, savings, featureRow, parseDeadline, needsDetail} from '/mailbox.mjs';
import {distanceMeters, neighbours, nearestStation, orderStops, planOuting, walkMinutes, estimates, mapsLink, groceryOnTheWay, openStatus} from '/walks.mjs';
import {japanToday, storePrograms, reward} from '/rules.mjs';

const KEY = 'worth-the-walk-v1';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const closeIcon = '<svg class="cw-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m4 4 10 10M14 4 4 14"/></svg>';
const rotateIcon = '<svg class="cw-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6a5.5 5.5 0 1 0 .5 5M14 2v4h-4"/></svg>';
const plural = (n, one, many) => n === 1 ? one : many;
const money = value => '¥' + Number(value).toLocaleString('en-US');
const uid = prefix => prefix + crypto.randomUUID();
const now = () => new Date().toISOString();
const titles = {walk:'Worth a walk', home:'Deals to use at home', keep:'Keep — not an ad', toss:'Safe to throw away'};
const fresh = () => ({version:1,settings:{lineId:null,home:null,maxMinutes:40,weightKg:60,theme:'light'},pages:{},overrides:{},flyers:[],labels:{},outings:[]});
const record = value => value && typeof value === 'object' && !Array.isArray(value);
// Personal letters retain no extracted text; samples also retain their demo marker.
const savedFlyer = f => f.sample ? {...storable(f),sample:true} : storable(f);
const pointValid = p => record(p) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180;
let savingFailed=false, savingDismissed=false;
function load() {
  let saved;
  try { saved=localStorage.getItem(KEY); }
  catch { savingFailed=true; return fresh(); }
  try {
    const s = JSON.parse(saved);
    if (!record(s) || s.version !== 1 || !record(s.settings) || !record(s.pages) || !record(s.overrides) || !record(s.labels) || !Array.isArray(s.flyers) || !Array.isArray(s.outings)) return fresh();
    if (!s.flyers.every(f => record(f) && typeof f.id === 'string' && typeof f.category === 'string' && Array.isArray(f.pageIds) && f.pageIds.every(id => typeof id === 'string') && Object.hasOwn(titles,f.bucket) && (f.bucket === 'keep' || (record(f.business) && Array.isArray(f.offers) && f.offers.every(record) && Array.isArray(f.items) && f.items.every(i => record(i) && Array.isArray(i.conditions)) && (!f.location || pointValid(f.location)))))) return fresh();
    if (!Object.values(s.pages).every(p => record(p) && typeof p.id === 'string' && typeof p.scannedAt === 'string' && Array.isArray(p.tiles) && p.tiles.every(t => t === null || record(t)))) return fresh();
    if (!s.outings.every(o => record(o) && typeof o.id === 'string' && Number.isFinite(Date.parse(o.createdAt)) && Array.isArray(o.stopIds) && o.stopIds.every(id => typeof id === 'string') && Array.isArray(o.used) && Array.isArray(o.stamps) && pointValid(o.start) && pointValid(o.end) && Number.isFinite(o.meters) && Number.isFinite(o.minutes) && ['planned','active','done'].includes(o.status) && o.stamps.every(s => record(s) && typeof s.stopId === 'string' && Number.isFinite(Date.parse(s.at)) && ['gps','self'].includes(s.kind)) && o.used.every(u => record(u) && typeof u.flyerId === 'string' && ['offer','item'].includes(u.kind) && Number.isInteger(u.index) && u.index >= 0))) return fresh();
    const base = fresh();
    base.settings = {lineId:railLines.some(l => l.id === s.settings.lineId) ? s.settings.lineId : null,home:stations.some(x => x.id === s.settings.home) ? s.settings.home : null,maxMinutes:[20,40,60,90].includes(s.settings.maxMinutes) ? s.settings.maxMinutes : 40,weightKg:Number.isFinite(s.settings.weightKg) && s.settings.weightKg > 0 ? s.settings.weightKg : 60};
    base.settings.theme = ['light','dark','auto'].includes(s.settings.theme) ? s.settings.theme : 'light';
    if (pointValid(s.settings.place)) base.settings.place = {lat:s.settings.place.lat,lon:s.settings.place.lon};
    base.pages = s.pages; base.overrides = s.overrides; base.flyers = s.flyers.map(savedFlyer); base.outings = s.outings;
    base.labels = Object.fromEntries(Object.entries(s.labels).filter(([,v]) => v === 0 || v === 1));
    for (const f of base.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete base.pages[id]; delete base.overrides[id]; }
    return base;
  } catch { return fresh(); }
}
let state = load(), coordinates = [], view = state.outings.some(o => o.status === 'active') ? 'walk' : state.outings.at(-1)?.status === 'done' ? 'done' : 'home', photos = [], busy = false, setupOpen = false;
let scores = new Map(), rankModel = '', rankSequence = 0;
let chosenStops = null, groceryChoice = null, historyQuery = '';
let sheet = null, sheetOpener = null, setupOpener = null;
const sheetTrail = [];
let recentStamp = null;
let startRequest = null, startPicker = false, startLine = '', startStation = '', locatingStart = false;
const thumbBlobs = new Map(), thumbURLs = new Map(), allItems = new Set(), addressOpen = new Set();
let reading = null, preparing = 0, recovering = true, recovered = false, photoStorage = true, wakeLock = null;
let photoWork = Promise.resolve();
const stampMessages = new Map();
const addressErrors = new Map();
let offline=!navigator.onLine, serviceUnavailable=false, coordinatesFailed=false, startError='', noticeTimer;
const offlineReason="You're offline. Reading flyers needs a connection; your mailbox, walk and stamps still work.";
const serviceReason='Reading is unavailable right now. You can still try the sample mailbox.';
const readUnavailable = () => offline;
function availability() {
  const markup=`${offline ? `<div id="offline-strip" class="cw-strip"><p>${offlineReason}</p></div>` : ''}${savingFailed && !savingDismissed ? `<div id="saving-strip" class="cw-strip" data-tone="error"><p>This browser isn't saving. Your mailbox and stamps will be lost when you close this page.</p><button data-action="dismiss-saving" aria-label="Dismiss saving warning">${closeIcon}</button></div>` : ''}${serviceUnavailable ? `<div id="service-strip" class="cw-strip" data-tone="warn"><p>${serviceReason}</p><button class="cw-text" data-action="sample" ${busy || startRequest ? 'disabled' : ''}>Try a sample mailbox</button></div>` : ''}`;
  if ($('availability').dataset.html !== markup) { $('availability').innerHTML=markup; $('availability').dataset.html=markup; }
}

function applyTheme() {
  const root=document.documentElement, theme=state.settings.theme;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme=theme === 'dark' ? 'dark' : 'light';
  const tokens=getComputedStyle(root);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme=theme === 'auto' ? (meta.media.includes('dark') ? 'dark' : 'light') : theme;
    meta.content=tokens.getPropertyValue('--paper-'+scheme).trim();
  }
}

const announcer=document.createElement('div');
announcer.id='announce'; announcer.className='cw-sr';
announcer.setAttribute('role','status'); announcer.setAttribute('aria-live','polite'); announcer.setAttribute('aria-atomic','true');
$('notice').after(announcer);

function notify(message = '', {tone='info',actionLabel,onAction} = {}) {
  const notice=$('notice');
  if (!onAction && message && !notice.hidden && notice.dataset.message === message && notice.dataset.tone === tone) return;
  notice.dataset.message=message;
  clearTimeout(noticeTimer);
  notice.replaceChildren(); notice.hidden=!message;
  notice.dataset.tone=tone;
  notice.setAttribute('role',tone === 'error' ? 'alert' : 'status');
  notice.setAttribute('aria-live',tone === 'error' ? 'assertive' : 'polite');
  if (!message) return;
  const text=document.createElement('span'); text.innerHTML=modelText(message); notice.append(text);
  if (actionLabel && onAction) {
    const action=document.createElement('button'); action.className='cw-text'; action.textContent=actionLabel;
    action.addEventListener('click',() => safely(onAction)); notice.append(action);
  }
  const close=document.createElement('button'); close.className='cw-toast-close'; close.setAttribute('aria-label','Dismiss'); close.innerHTML=closeIcon;
  close.addEventListener('click',() => notify('')); notice.append(close);
  // Info hides itself; one with an action (Undo) stays a little longer so it can be reached.
  if (tone === 'info') noticeTimer=setTimeout(() => notify(''),actionLabel ? 10000 : 6000);
}
function save() {
  delete state.shoppingList;
  state.flyers = state.flyers.map(savedFlyer);
  for (const f of state.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete state.pages[id]; delete state.overrides[id]; thumbBlobs.delete(id); void photoDB('delete',id,'thumbs'); }
  try { localStorage.setItem(KEY,JSON.stringify(state)); return true; }
  catch { savingFailed=true; availability(); return false; }
}
function home() {
  if (state.settings.home) {
    const point = coordinates.find(s => s.id === state.settings.home);
    return pointValid(point) ? {stationId:point.id,lat:point.lat,lon:point.lon} : null;
  }
  return pointValid(state.settings.place) ? {stationId:null,...state.settings.place,here:true} : null;
}
const rounded = (value,digits) => Number(value.toFixed(digits));
function askStart(type,ids=null) {
  if (type === 'read' && !photos.some(p => !ids || ids.includes(p.id))) return;
  startRequest={type,ids}; view='home'; render();
  const heading=$('start-heading'); heading.focus(); heading.scrollIntoView({block:'center'});
}
async function continueStart() {
  if (!home() || !startRequest) return;
  const request=startRequest; startRequest=null; startPicker=false; render();
  if (request.type === 'sample') await sampleMailbox();
  else if (request.type === 'merge') await retryMerge();
  else await readPhotos(request.ids);
}
function useStation(lineId,stationId) {
  const point=coordinates.find(s => s.id === stationId);
  if (!pointValid(point)) { startError='Choose a station with available coordinates.'; render(); if (setupOpen) renderSetup(); return false; }
  startError='';
  state.settings.home=stationId; state.settings.lineId=lineId; delete state.settings.place;
  groceryChoice=null; save(); return true;
}
async function useLocation() {
  if (locatingStart || busy) return;
  locatingStart=true; render(); if (setupOpen) renderSetup();
  try {
    const position=await new Promise((resolve,reject) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:15000,maximumAge:600000}) : reject(new Error('Location unavailable')));
    const place={lat:rounded(position.coords.latitude,4),lon:rounded(position.coords.longitude,4)};
    if (!pointValid(place)) throw new Error('Invalid location');
    state.settings.place=place; state.settings.home=null; state.settings.lineId=null;
    groceryChoice=null; startError=''; save(); notify();
  } catch { startPicker=true; startError='Location is off for this site, so pick a station instead.'; }
  finally { locatingStart=false; render(); if (setupOpen) renderSetup(); }
  if (startError) (setupOpen ? $('setup-line') : $('start-line'))?.focus({preventScroll:true});
  else if (home()) await continueStart();
}
function stationSelects(prefix,lineId,stationId) {
  const options=(rows,selected) => rows.map(row => `<option value="${escape(row.id)}"${row.id === selected ? ' selected' : ''}>${escape(row.name)}</option>`).join('');
  return `<label class="cw-field">Train line<select id="${prefix}-line"><option value="">Choose a line</option>${options(railLines,lineId)}</select></label><label class="cw-field">${prefix === 'setup' ? 'Home station' : 'Start station'}<select id="${prefix}-station" aria-invalid="${Boolean(startError)}"${startError ? ` aria-describedby="${prefix}-error"` : ''}><option value="">Choose a station</option>${options(stationsOnLine(stations,lineId),stationId)}</select></label>`;
}
function stationOptions(prefix,selected=null) {
  const line=$(prefix+'-line'), station=$(prefix+'-station');
  station.innerHTML='<option value="">Choose a station</option>'+stationsOnLine(stations,line.value).map(s => `<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('');
  station.value=selected ?? '';
}
function startChooser() {
  return startRequest ? `<section class="cw-start" aria-labelledby="start-heading"><h1 id="start-heading" tabindex="-1">Where do you start walking?</h1><p class="cw-muted">We plan the walk from here and back. Your location stays on this phone.</p><button class="cw-primary cw-wide" data-action="use-location" ${locatingStart ? 'disabled' : ''}>${locatingStart ? 'Finding your location…' : 'Use my location'}</button><button class="cw-secondary cw-wide" data-action="pick-station" aria-expanded="${startPicker}" ${locatingStart ? 'disabled' : ''}>Pick a station</button>${startProblems()}${startPicker ? stationSelects('start',startLine,startStation)+`<button class="cw-secondary cw-wide" data-action="use-station" ${locatingStart ? 'disabled' : ''}>Use this station</button>` : ''}</section>` : '';
}
function startProblems(prefix='start') {
  return `${startError ? `<p id="${prefix}-error" class="cw-inline-reason" role="status">${escape(startError)}</p>` : ''}${coordinatesFailed ? '<div class="cw-inline-reason" role="status"><p>Station coordinates could not be loaded. Reload to pick a station.</p><button data-action="reload-coordinates">Reload</button></div>' : ''}`;
}
async function loadCoordinates() {
  try { const response=await fetch('/station-coordinates.json'); if (!response.ok) throw new Error(); const points=await response.json(); if (!Array.isArray(points)) throw new Error(); coordinates=points; coordinatesFailed=false; }
  catch { coordinatesFailed=true; }
  render(); if (setupOpen) renderSetup();
}
const stationName = point => stations.find(s => s.id === point?.stationId)?.name ?? 'Station';
const flyer = id => state.flyers.find(f => f.id === id);
function stop(id) {
  const f = flyer(id);
  if (f?.location) return {...f.location,id:f.id,name:f.business?.name ?? 'Flyer stop',category:f.category,flyer:f};
  const store = stores.find(s => 'store:' + s.branchId === id);
  return store ? {...store,id,name:store.name,category:'supermarket'} : null;
}
const expired = f => Boolean(f.deadline && f.deadline < japanToday());
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? value + 'T12:00:00+09:00' : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Tokyo'}).format(date) : '';
}
const scanDate = f => state.pages[f.pageIds?.[0]]?.scannedAt?.slice(0,10) ?? japanToday();
const sortedWalks = () => state.flyers.filter(f => f.bucket === 'walk').sort((a,b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
function row(f) { const h = home(); return featureRow(f,{today:japanToday(),distanceMeters:h && f.location ? distanceMeters(h,f.location) : null}); }
function requestError(response,data) {
  const error = new Error(response.status === 429 ? `Reading limit reached — try again in ${Math.max(1,Math.ceil(Number(data.retryAfter || response.headers.get('Retry-After')) / 60) || 1)} min` : data.error ?? 'Request failed. Please try again.');
  error.status = response.status;
  return error;
}
function readingReason(error) {
  if (offline || error instanceof TypeError || /network|fetch|connection|interrupted/i.test(error.message)) return 'No connection';
  if (error.status === 429) return error.message;
  if (['AbortError','TimeoutError'].includes(error.name) || /timeout|timed out/i.test(error.message)) return 'Took too long';
  if (error.status === 413 || /too (large|detailed)|payload|detail limit/i.test(error.message)) return 'Photo too large — try a closer, smaller photo';
  return "Couldn't read this page";
}
async function api(path, body, signal) {
  const response = await fetch(path,body === undefined ? {signal} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw requestError(response,data);
  }
  return response.json();
}
async function rank() {
  const sequence = ++rankSequence;
  const train = state.flyers.filter(f => !f.sample && f.bucket !== 'keep' && Object.hasOwn(state.labels,f.id)).map(f => ({row:row(f),label:state.labels[f.id]}));
  if (train.length < 6 || new Set(train.map(t => t.label)).size < 2) { scores.clear(); rankModel = ''; render(); return; }
  try {
    const result = await api('/api/rank',{train,predict:state.flyers.filter(f => !f.sample && f.bucket === 'walk').map(f => ({id:f.id,row:row(f)}))});
    if (sequence !== rankSequence) return;
    scores = new Map(result.scores.map(s => [s.id,s.p])); rankModel = result.model; render();
  } catch { if (sequence === rankSequence) notify('The order could not be updated. Your mailbox is still available.',{tone:'error'}); }
}

// Prepared photos and retained thumbnails live in IndexedDB, never localStorage.
async function photoDB(method,value,store = 'pages') {
  let db;
  try {
    if (!photoStorage) return method === 'getAll' ? [] : false;
    db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('worth-the-walk-photos',2);
      let expired=false;
      const fail = error => { expired=true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => fail(new Error('Photo storage unavailable')),3000);
      request.onupgradeneeded = () => { try { if (!request.result.objectStoreNames.contains('pages')) request.result.createObjectStore('pages',{keyPath:'pageId'}); if (!request.result.objectStoreNames.contains('thumbs')) request.result.createObjectStore('thumbs',{keyPath:'pageId'}); } catch (error) { fail(error); } };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Photo storage blocked'));
      request.onsuccess = () => {
        try { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result); }
        catch (error) { fail(error); }
      };
    });
    return await new Promise((resolve,reject) => {
      setTimeout(() => reject(new Error('Photo storage timed out')),3000);
      const transaction = db.transaction(store,['getAll','get'].includes(method) ? 'readonly' : 'readwrite');
      const request = transaction.objectStore(store)[method](...(value === undefined ? [] : [value]));
      transaction.oncomplete = () => resolve(['getAll','get'].includes(method) ? request.result : true);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Photo storage failed'));
      request.onerror = () => reject(request.error);
    });
  } catch {
    photoStorage = false;
    notify('Photo storage is unavailable. Keep this screen open until reading finishes.',{tone:'warn'});
    return method === 'getAll' ? [] : false;
  } finally { try { db?.close(); } catch {} }
}
const storePhoto = p => photoDB('put',{pageId:p.id,blob:p.blob,addedAt:p.addedAt,rotation:p.rotation,status:p.status});
async function recoverPhotos() {
  try {
    const thumbs = await photoDB('getAll',undefined,'thumbs');
    for (const t of thumbs) if (t.blob instanceof Blob) {
      if (state.flyers.some(f => f.bucket === 'keep' && f.pageIds.includes(t.pageId))) await photoDB('delete',t.pageId,'thumbs');
      else thumbBlobs.set(t.pageId,t.blob);
    }
    const pending = await photoDB('getAll');
    for (const p of pending.filter(p => record(p) && typeof p.pageId === 'string' && typeof p.addedAt === 'string').sort((a,b) => a.addedAt.localeCompare(b.addedAt))) {
      if ((state.pages[p.pageId] && !state.pages[p.pageId].detailPending) || state.flyers.some(f => f.bucket === 'keep' && f.pageIds.includes(p.pageId))) { await photoDB('delete',p.pageId); continue; }
      if (!(p.blob instanceof Blob) || !Number.isFinite(Date.parse(p.addedAt))) continue;
      photos.push({id:p.pageId,file:p.blob,blob:p.blob,url:URL.createObjectURL(p.blob),rotation:p.rotation,sourceRotation:p.rotation,addedAt:p.addedAt,status:'waiting',parts:new Set()});
    }
    recovered = photos.length > 0;
  } finally { recovering = false; render(); }
}
const jpeg = canvas => new Promise((resolve,reject) => canvas.toBlob(b => b?.type === 'image/jpeg' ? resolve(b) : reject(new Error('Could not encode the photo. Try another image.')),'image/jpeg',.85));
function paperBox(sample) {
  const {width:w,height:h} = sample, data = sample.getContext('2d').getImageData(0,0,w,h).data;
  const luminance = new Uint8Array(w*h), border = [];
  for (let i=0;i<luminance.length;i++) {
    luminance[i] = .2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2];
    const x=i%w,y=Math.floor(i/w);
    if (x < w*.05 || x > w*.95 || y < h*.05 || y > h*.95) border.push(luminance[i]);
  }
  border.sort((a,b) => a-b);
  const threshold = Math.max(100,border[Math.floor(border.length/2)]+40);
  const seen = new Uint8Array(w*h), queue = new Int32Array(w*h);
  let largest = null;
  for (let i=0;i<seen.length;i++) {
    if (seen[i] || luminance[i] <= threshold) continue;
    let head=0,tail=1,left=w,right=0,top=h,bottom=0; queue[0]=i; seen[i]=1;
    while (head < tail) {
      const n=queue[head++],x=n%w,y=Math.floor(n/w);
      left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
      for (const k of [x ? n-1 : -1,x<w-1 ? n+1 : -1,y ? n-w : -1,y<h-1 ? n+w : -1]) if (k>=0 && !seen[k] && luminance[k]>threshold) { seen[k]=1; queue[tail++]=k; }
    }
    if (!largest || tail > largest.count) largest={left,right,top,bottom,count:tail};
  }
  if (!largest) return null;
  const area=(largest.right-largest.left+1)*(largest.bottom-largest.top+1)/(w*h);
  if (area < .25 || area > .95) return null;
  return {left:Math.max(0,largest.left/w-.02),top:Math.max(0,largest.top/h-.02),right:Math.min(1,(largest.right+1)/w+.02),bottom:Math.min(1,(largest.bottom+1)/h+.02)};
}
async function preparePhoto(photo) {
  const bitmap = await createImageBitmap(photo.file,{imageOrientation:'from-image'});
  try {
    const rotation = (photo.rotation-(photo.sourceRotation ?? 0)+360)%360, turn = rotation%180 !== 0;
    const width=turn ? bitmap.height : bitmap.width,height=turn ? bitmap.width : bitmap.height;
    const sample = document.createElement('canvas'), small=Math.min(1,256/Math.max(width,height));
    sample.width=Math.max(1,Math.round(width*small)); sample.height=Math.max(1,Math.round(height*small));
    const draw = (ctx,scale,left=0,top=0) => {
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
      ctx.translate((width/2-left)*scale,(height/2-top)*scale); ctx.rotate(rotation*Math.PI/180);
      ctx.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);
    };
    draw(sample.getContext('2d'),small);
    const box=paperBox(sample) ?? {left:0,top:0,right:1,bottom:1};
    const cropW=(box.right-box.left)*width,cropH=(box.bottom-box.top)*height,scale=Math.min(1,2048/Math.max(cropW,cropH));
    const page=document.createElement('canvas'); page.width=Math.max(1,Math.round(cropW*scale)); page.height=Math.max(1,Math.round(cropH*scale));
    draw(page.getContext('2d'),scale,box.left*width,box.top*height);
    const blob=await jpeg(page);
    const thumb=document.createElement('canvas'), thumbScale=Math.min(1,480/Math.max(page.width,page.height));
    thumb.width=Math.max(1,Math.round(page.width*thumbScale)); thumb.height=Math.max(1,Math.round(page.height*thumbScale));
    thumb.getContext('2d').drawImage(page,0,0,thumb.width,thumb.height);
    const thumbnail=await new Promise((resolve,reject) => thumb.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare preview.')),'image/jpeg',.7));
    if (await photoDB('put',{pageId:photo.id,blob:thumbnail},'thumbs')) thumbBlobs.set(photo.id,thumbnail);
    thumb.width=thumb.height=0;
    if (photo.url) URL.revokeObjectURL(photo.url);
    photo.blob=blob; photo.url=URL.createObjectURL(blob);
    page.width=page.height=sample.width=sample.height=0;
    await storePhoto(photo);
  } finally { bitmap.close(); }
}
async function addPhotos(files) {
  let skipped=0;
  preparing++; render();
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) { skipped++; continue; }
      const photo={id:uid('p-'),file,rotation:0,addedAt:now(),status:'waiting',parts:new Set()};
      try { await preparePhoto(photo); photos.push(photo); render(); }
      catch (error) { if (['InvalidStateError','NotSupportedError'].includes(error.name) || /decode|unsupported|source image/i.test(error.message)) skipped++; else notify('This photo could not be prepared. Try another photo.',{tone:'error'}); }
    }
  } finally { preparing--; render(); if (skipped) notify(`${skipped} ${plural(skipped,'file','files')} skipped: not photos.`,{tone:'warn'}); }
}
async function tilePage(photo) {
  const bitmap = await createImageBitmap(photo.blob);
  const page=document.createElement('canvas'); page.width=bitmap.width; page.height=bitmap.height;
  try {
    page.getContext('2d').drawImage(bitmap,0,0);
    const cols = page.height >= page.width ? 2 : 3, rows = cols === 2 ? 3 : 2, result = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const cellW = page.width/cols, cellH = page.height/rows;
      // Neighbours share 10% of a cell: 5% beyond each edge at a seam.
      const left = Math.max(0,Math.floor(x*cellW-cellW*.05)), top = Math.max(0,Math.floor(y*cellH-cellH*.05));
      const right = Math.min(page.width,Math.ceil((x+1)*cellW+cellW*.05)), bottom = Math.min(page.height,Math.ceil((y+1)*cellH+cellH*.05));
      const tile = document.createElement('canvas'); tile.width = right-left; tile.height = bottom-top;
      tile.getContext('2d').drawImage(page,left,top,tile.width,tile.height,0,0,tile.width,tile.height);
      const blob = await jpeg(tile);
      if (blob.size > 2*1024*1024) throw new Error('This photo is too detailed to read. Try a smaller photo.');
      const dataURL = await imageURL(blob);
      result.push(dataURL); tile.width = tile.height = 0;
    }
    return result;
  } finally { bitmap.close(); page.width=page.height=0; }
}
async function imageURL(blob) {
  const dataURL = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read photo.')); reader.readAsDataURL(blob); });
  if (dataURL.length > 2*1024*1024) throw new Error('This photo is too detailed to read. Try a smaller photo.');
  return dataURL;
}
async function readPass(photo,session,tiles,mode) {
  session.controller.signal.throwIfAborted();
  let lastPart=performance.now();
  const response = await fetch('/api/read-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:photo.id,tiles,mode}),signal:session.controller.signal});
  if (!response.ok) { const e = await response.json().catch(() => ({})); throw requestError(response,e); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const page = {id:photo.id,scannedAt:japanToday(),tiles:Array(tiles.length).fill(null)};
  const seen = new Set();
  let buffer = '', done = false, failed = 0;
  function line(text) {
    if (!text.trim()) return;
    const event = JSON.parse(text);
    if (event.type === 'tile' || event.type === 'tile-error') {
      if (Number.isInteger(event.index) && event.index >= 0 && event.index < tiles.length && !seen.has(event.index)) {
        seen.add(event.index); page.tiles[event.index] = event.tile ?? null;
        if (mode === 'tiles') photo.parts.add(event.index);
        if (event.type === 'tile-error') failed++;
        const time=performance.now(); session.durations.push(time-lastPart); lastPart=time;
        updateReading();
      }
    } else if (event.type === 'done' && Array.isArray(event.tiles) && event.tiles.length === tiles.length) { page.tiles = event.tiles; done = true; }
  }
  try {
    while (true) {
      const chunk = await reader.read(); buffer += decoder.decode(chunk.value,{stream:!chunk.done});
      let end; while ((end = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0,end)); buffer = buffer.slice(end+1); }
      if (chunk.done) break;
    }
    line(buffer); session.controller.signal.throwIfAborted();
    if (!done) throw new Error('Reading was interrupted. Your photo is ready to try again.');
    if (page.tiles.every(t => !t)) throw new Error('No parts could be read. Try a clearer photo.');
    if (failed) notify(`${failed} parts could not be read. Check the printed flyer before using an offer.`,{tone:'warn'});
    return page.tiles;
  } finally { reader.releaseLock(); }
}
async function readPage(photo,session,sortReadings) {
  photo.status='reading'; photo.parts.clear(); photo.error=''; updateReading();
  await storePhoto(photo);
  let page=state.pages[photo.id];
  if (!page?.detailPending) {
    const tiles=await readPass(photo,session,[await imageURL(photo.blob)],'page');
    photo.wholeRead=true; photo.detailNeeded=needsDetail(tiles[0]);
    page={id:photo.id,scannedAt:japanToday(),tiles,detailPending:photo.detailNeeded,detailed:false,needsMerge:true};
    state.pages[page.id]=page;
    save();
  } else { photo.wholeRead=true; photo.detailNeeded=true; }
  photo.status=photo.detailNeeded ? 'detailing' : 'read';
  updateReading();
  // Queue the merge immediately. Detail work starts after the first card is shown.
  await sortReadings(page.id);
  if (photo.detailNeeded) {
    const tiles=await readPass(photo,session,await tilePage(photo),'tiles');
    page.tiles=[page.tiles[0],...tiles]; page.detailed=true; page.detailPending=false; page.needsMerge=true;
    photo.parts=new Set(tiles.map((_,i) => i)); photo.status='read';
    save(); updateReading();
    await sortReadings(page.id);
  }
  const saved=save();
  // Keep the recovery copy until all required readings are saved successfully.
  if (saved) await photoDB('delete',photo.id);
  photo.file=null; photo.blob=null;
  photos=photos.filter(p => p.id !== photo.id);
  updateReading();
}
function replaceFlyers(current,replacements) {
  const pending=new Set(replacements), result=[];
  for (const old of current) {
    const matches=replacements.filter(f => f.pageIds.some(id => old.pageIds.includes(id)));
    if (!matches.length) result.push(old);
    for (const f of matches) if (pending.delete(f)) result.push(f);
  }
  return [...result,...pending];
}
// Round every server-bound start point, including station starts, at this boundary.
function serverHome() {
  const h=home();
  return h ? {stationId:h.stationId ?? "here",lat:Number(h.lat.toFixed(2)),lon:Number(h.lon.toFixed(2))} : null;
}
async function mergeGroups(affected = null,signal) {
  const groups = groupPages(Object.values(state.pages).filter(p => !state.flyers.some(f => f.sample && f.pageIds.includes(p.id))),state.overrides);
  const selected = affected ? groups.filter(g => g.pageIds.some(id => affected.has(id))) : groups.filter(g => g.pageIds.some(id => state.pages[id]?.needsMerge) || !state.flyers.some(f => f.pageIds.length === g.pageIds.length && f.pageIds.every(id => g.pageIds.includes(id))));
  const staged=[];
  const originalFlyers=[...state.flyers];
  for (let i = 0; i < selected.length; i++) {
    signal?.throwIfAborted();
    const group = selected[i];
    if (!reading?.active) $('progress').textContent = `Sorting flyer ${i+1} of ${selected.length}…`;
    const oldFlyers = state.flyers.filter(f => f.pageIds.some(id => group.pageIds.includes(id)));
    const old = oldFlyers.find(f => f.pageIds.length === group.pageIds.length && f.pageIds.every(id => group.pageIds.includes(id))) ?? oldFlyers.find(f => f.pageIds.every(id => group.pageIds.includes(id)));
    // Stage each replacement before removing any old flyer, so a failed merge is retryable.
    const result = await api('/api/merge',{flyerId:old?.id ?? group.id,pages:group.pageIds.map(id => ({id,detailed:Boolean(state.pages[id].detailed),tiles:state.pages[id].tiles})),scanDate:japanToday(),home:serverHome()},signal);
    signal?.throwIfAborted();
    const stored = storable(result.flyer);
    if (affected) {
      staged.push(stored);
      if (stored.bucket === 'keep') {
        state.flyers=[...state.flyers.filter(f => !f.pageIds.some(id => stored.pageIds.includes(id))),stored]; save();
      }
      continue;
    }
    state.flyers = replaceFlyers(state.flyers,[stored]);
    for (const id of group.pageIds) if (state.pages[id]) state.pages[id].needsMerge=false;
    // A page correction can change entry indices. Follow printed text/value, not the old index.
    for (const outing of state.outings) for (const used of [...outing.used]) {
      const previous = oldFlyers.find(f => f.id === used.flyerId); if (!previous) continue;
      const key = used.kind === 'offer' ? 'offers' : 'items', entry = previous[key]?.[used.index];
      const index = (stored[key] ?? []).findIndex(e => JSON.stringify({...e,page:null}) === JSON.stringify({...entry,page:null}));
      if (index >= 0) { used.flyerId = stored.id; used.index = index; }
      else outing.used = outing.used.filter(u => u !== used);
    }
    save(); groceryChoice = null; render();
  }
  if (affected) {
    const ids=new Set(selected.flatMap(g => g.pageIds));
    state.flyers=replaceFlyers(state.flyers,staged);
    for (const id of ids) if (state.pages[id]) state.pages[id].needsMerge=false;
    for (const outing of state.outings) for (const used of [...outing.used]) {
      const old=originalFlyers.find(f => f.id === used.flyerId && f.pageIds.some(id => ids.has(id))); if (!old) continue;
      const key=used.kind === 'offer' ? 'offers' : 'items', entry=old[key]?.[used.index];
      const match=staged.map(f => ({f,index:(f[key] ?? []).findIndex(e => JSON.stringify({...e,page:null}) === JSON.stringify({...entry,page:null}))})).find(m => m.index >= 0);
      if (match) { used.flyerId=match.f.id; used.index=match.index; }
      else outing.used=outing.used.filter(u => u !== used);
    }
    save();  groceryChoice=null; render();
  }
  if (!reading?.active) { await rank(); $('progress').textContent = ''; }
}
async function acquireWakeLock(session) {
  if (!session?.active || session.controller.signal.aborted || document.visibilityState !== 'visible' || !navigator.wakeLock || wakeLock || session.lockRequest) return;
  session.lockRequest=true;
  try {
    const lock=await navigator.wakeLock.request('screen');
    if (!session.active || session.controller.signal.aborted) { await lock.release(); return; }
    wakeLock=lock; lock.addEventListener('release',() => { if (wakeLock === lock) wakeLock=null; });
  } catch { /* Unsupported, denied, or low battery: reading still works. */ }
  finally { session.lockRequest=false; }
}
async function releaseWakeLock() {
  const lock=wakeLock; wakeLock=null;
  try { await lock?.release(); } catch {}
}
function guardUnload(event) { event.preventDefault(); event.returnValue=''; }
function stopReading(message='Reading stopped. Your unread pages are kept for later.',keepWaiting=true) {
  if (!reading?.active) return;
  reading.message=message; reading.keepWaiting=keepWaiting; reading.controller.abort(); updateReading();
  window.removeEventListener('beforeunload',guardUnload); void releaseWakeLock();
}
async function retryPages(ids) {
  if (readUnavailable()) return;
  const failed=photos.filter(p => ids.includes(p.id) && p.status === 'failed');
  if (!failed.length) return;
  if (reading?.active && !reading.controller.signal.aborted) {
    for (const p of failed) { p.status='waiting'; p.error=''; p.parts.clear(); reading.queue.push(p); }
    updateReading();
  } else await readPhotos(failed.map(p => p.id));
}
async function readPhotos(ids=null) {
  if (readUnavailable()) return;
  if (!photos.length || busy || preparing || recovering) return;
  const batch=photos.filter(p => !ids || ids.includes(p.id)); if (!batch.length) return;
  if (!home()) { askStart('read',ids); return; }
  const previous=reading;
  const batchWithFailures=ids ? [...(previous?.batch ?? []).filter(p => !batch.includes(p)),...batch].sort((a,b) => a.pageNumber-b.pageNumber) : batch;
  busy=true; recovered=false; view='home';
  const cleared=await clearSample(); notify(cleared ? 'Sample mailbox cleared.' : '');
  const session={batch:batchWithFailures,completed:previous?.completed ?? 0,queue:[...batch],controller:new AbortController(),active:true,started:performance.now(),durations:[],message:''};
  reading=session;
  for (const p of batch) { p.pageNumber ??= photos.indexOf(p)+1; p.status='waiting'; p.parts.clear(); p.error=''; p.wholeRead=Boolean(state.pages[p.id]?.detailPending); p.detailNeeded=p.wholeRead; }
  render(); $('reading-card').scrollIntoView({block:'start'}); $('reading-heading').focus({preventScroll:true});
  window.addEventListener('beforeunload',guardUnload); void acquireWakeLock(session);
  const timer=setInterval(updateReading,1000);
  let mergeWork=Promise.resolve();
  const sortReadings=id => {
    mergeWork=mergeWork.catch(() => {}).then(async () => {
      if (session.controller.signal.aborted) return;
      try { await mergeGroups(new Set([id]),session.controller.signal); }
      catch (error) {
        if (error.name !== 'AbortError') {
          if (error.status >= 500) { serviceUnavailable=true; availability(); }
          session.message='Your readings are saved. Use Retry sorting saved readings to finish sorting them.'; notify(session.message,{tone:'error',actionLabel:'Retry',onAction:retryMerge});
          if (error.status === 429) { stopReading('',false); if (!session.failureNotice) { session.failureNotice=true; notify(readingReason(error),{tone:'error'}); } }
        }
      }
    });
    return mergeWork;
  };
  try {
    // Commit all prepared images before the first request; IndexedDB failure falls back to memory.
    for (const p of batch) await storePhoto(p);
    await Promise.all(Array.from({length:Math.min(3,batch.length)},async () => {
      while (session.queue.length && !session.controller.signal.aborted) {
        const p=session.queue.shift();
        try { await readPage(p,session,sortReadings); }
        catch (error) {
          const stopped=error.name === 'AbortError' && session.controller.signal.aborted && session.keepWaiting;
          p.status=stopped ? 'waiting' : 'failed';
          p.error=stopped ? '' : readingReason(error);
          if (error.status >= 500) { serviceUnavailable=true; availability(); }
          if (error.status === 429) { stopReading('',false); if (!session.failureNotice) { session.failureNotice=true; notify(readingReason(error),{tone:'error'}); } }
          else if (!stopped && !session.failureNotice) { session.failureNotice=true; notify(p.error,{tone:'error',actionLabel:'Retry',onAction:() => retryPages([p.id])}); }
          await storePhoto(p);

          updateReading();
        }
      }
    }));
    await mergeWork;
  } finally {
    clearInterval(timer); session.active=false; window.removeEventListener('beforeunload',guardUnload); await releaseWakeLock();
    for (const p of batch.filter(p => p.status === 'read')) URL.revokeObjectURL(p.url);
    // Remove completed rows before revoking their preview URLs on a paused card.
    session.completed+=session.batch.filter(p => p.status === 'read').length;
    session.batch=session.batch.filter(p => p.status !== 'read');
    if (!session.batch.length) reading=null;
    busy=false; render();
    if (!reading) { $('progress').textContent=''; focusHeading(); }
    else announceReading();
    await rank();
  }
}

function arrivalStatus(f,minutes) {
  // Lessons and events print class times, not opening hours, so they never rule a stop out.
  if (['lesson','event'].includes(f.category)) return 'unknown';
  const date = new Date(Date.now()+minutes*60000);
  const time = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).split(':');
  return openStatus({hours:f.hours ?? f.location?.place?.hours},japanToday(date),Number(time[0])*60+Number(time[1]));
}
function candidates() {
  return sortedWalks().filter(f => !stopWarnings(f).length);
}
function stopWarnings(f) {
  const warnings=[];
  if (expired(f)) warnings.push('Expired');
  if (home() && f.location && arrivalStatus(f,walkMinutes(distanceMeters(home(),f.location))) === 'closed') warnings.push("Closed when you'd arrive");
  if (state.labels[f.id] === 0) warnings.push('Marked Not for me');
  return warnings;
}
const stopSelected = f => chosenStops === null ? !stopWarnings(f).length : chosenStops.has(f.id);
function plan() {
  const h = home(); if (!h) return null;
  const selected = candidates().filter(f => f.location && stopSelected(f)).map(f => stop(f.id));
  if (groceryChoice) { const g = stop(groceryChoice); if (g) selected.push(g); }
  const starts = [h,...(h.stationId ? neighbours(stations,stationsOnLine,h.stationId,1) : []).map(n => coordinates.find(s => s.id === n.station.id)).filter(Boolean).map(s => ({stationId:s.id,lat:s.lat,lon:s.lon}))];
  const plans = starts.map((start,index) => ({...planOuting({start,end:h,stops:selected,maxMinutes:state.settings.maxMinutes}),mode:index ? 'early' : 'home'}));
  const stationPoint = p => {
    const nearest = nearestStation(stations,coordinates,p);
    const location = nearest && coordinates.find(c => c.id === nearest.station.id);
    return location ? {stationId:location.id,lat:location.lat,lon:location.lon} : null;
  };
  // Keep the same stop priority as home/one-stop-early plans. Recompute train
  // endpoints for each smaller selection so a dropped stop never anchors it.
  for (let count=selected.length;count>0;count--) {
    const kept=selected.slice(0,count), trainPlans=[];
    // Pin the first and last stop, then minimise the route between them. This
    // makes the train stations nearest to the actual route endpoints.
    for (const first of kept) {
      for (const final of kept.length === 1 ? kept : kept.filter(p => p !== first)) {
        const middle=kept.filter(p => p !== first && p !== final);
        const route=kept.length === 1 ? [first] : [first,...orderStops(first,final,middle).stops,final];
        const start=stationPoint(first), last=stationPoint(final);
        if (!start || !last) continue;
        for (const end of [h,last]) {
          let previous=start, meters=0;
          for (const p of [...route,end]) { meters+=distanceMeters(previous,p); previous=p; }
          const minutes=walkMinutes(meters);
          if (minutes<=state.settings.maxMinutes) trainPlans.push({start,end,stops:route,meters,minutes,estimates:estimates(meters),dropped:selected.slice(count),mode:'train'});
        }
      }
    }
    if (trainPlans.length) { plans.push(...trainPlans); break; }
  }
  return plans.sort((a,b) => b.stops.length-a.stops.length || a.meters-b.meters)[0];
}
function totals(o) {
  const e = estimates(o.meters,state.settings.weightKg);
  return `${(e.routeMeters/1000).toFixed(1)} km · ~${e.minutes} min · ~${e.steps.toLocaleString('en-US')} steps · ~${e.kcal} kcal (estimates)`;
}

let sealRender = 0;
function sealHTML(stamp,{current=true,animate=true,finished=false} = {}) {
  const p=stop(stamp.stopId), f=p?.flyer, kind=finished ? 'Worth the walk' : capital(f?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : 'Stamped place'));
  const id=stamp.stopId+':'+stamp.at;
  const hash=[...id].reduce((hash,c) => (hash*31+c.charCodeAt(0)) >>> 0,0), angle=hash%17-8;
  const dojo=/dojo|aikido|karate|judo|kendo|martial|道場/i.test([f?.business?.kind,f?.business?.name,p?.name].join(' '));
  const [mark,ink]=finished ? ['済','vermilion'] : dojo ? ['道','teal'] : ['lesson','fitness'].includes(p?.category) ? ['体','indigo'] : p?.category === 'cleaning' ? ['洗','green'] : p?.category === 'clinic' ? ['医','green'] : ['supermarket','drugstore','shop'].includes(p?.category) ? ['市','vermilion'] : ['restaurant','food_delivery'].includes(p?.category) ? ['食','vermilion'] : p?.category === 'event' ? ['祭','teal'] : ['歩','teal'];
  const arcId='stamp-arc-'+hash+'-'+(++sealRender), label=String(kind).toUpperCase(), date=japanToday(new Date(stamp.at)).replaceAll('-','.');
  const arriving=current && animate && recentStamp === stamp.stopId;
  return `${arriving ? `<span class="cw-seal-impression" style="--c:var(--ink-${ink})">` : ''}<svg class="cw-seal${finished ? ' cw-finished-seal' : ''}${current ? ' cw-stamp' : ''} ${stamp.kind === 'gps' ? 'gps' : 'self'}${arriving ? ' new' : ''}" viewBox="0 0 100 100" style="--c:var(--ink-${ink});--r:${finished ? -9 : angle}deg" ${finished ? 'aria-hidden="true"' : `role="img" aria-label="${escape(kind)} stamp, ${escape(formatDate(stamp.at))}, ${stamp.kind === 'gps' ? 'GPS verified' : 'stamped without GPS'}"`}>
    <g filter="url(#ink)">
      <circle class="outer" cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="4.2"/>
      <circle cx="50" cy="50" r="39.5" fill="none" stroke="currentColor" stroke-width="1.1"/>
      <path id="${arcId}" d="M 19 52 A 31 31 0 0 1 81 52" fill="none"/>
      <text class="arc"${label.length>16 ? ' textLength="86" lengthAdjust="spacingAndGlyphs"' : ''}><textPath id="text-${arcId}" href="#${arcId}" startOffset="50%" text-anchor="middle">${modelText(label.slice(0,16),'tspan')}</textPath></text>
      <text class="mark" lang="ja" x="50" y="64" text-anchor="middle">${mark}</text>
      <rect x="31" y="69.5" width="38" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
      <text class="date" x="50" y="77.6" text-anchor="middle">${date}</text>
    </g>
  </svg>${arriving ? '</span>' : ''}`;
}
function stampCard(stamp) {
  const p=stop(stamp.stopId), f=p?.flyer, kind=capital(f?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : 'Stamped place'));
  const name=f?.business?.name ?? p?.name;
  return `<div class="cw-stamp-card" data-stamp="${escape(stamp.stopId)}">${sealHTML(stamp)}<div class="cw-stamp-name">${modelText(kind)}${name ? `<small>${modelText(name)}</small>` : ''}</div><p class="cw-meta">${escape(formatDate(stamp.at))}</p></div>`;
}
function emptyStamp(label='',hidden=false) { return `<div class="cw-spot"${hidden ? ' aria-hidden="true"' : ''}>${label === 'Next stamp' ? '<span class="cw-spot-mark" lang="ja" aria-hidden="true">歩</span>' : ''}<span>${modelText(label)}</span></div>`; }
const stopKind = id => { const p=stop(id); return capital(p?.flyer?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : p?.name ?? 'Stop')); };
function stopState(o,id,i) { return o.stamps.some(s => s.stopId === id) ? 'stamped' : (o.skipped ?? []).includes(id) ? 'skipped' : i === currentCursor(o) ? 'current' : 'upcoming'; }
function lineMap(o) {
  return `<div class="cw-line-map" aria-hidden="true" style="--stations:${o.stopIds.length+2}"><span class="cw-line-station endpoint"><i class="cw-line-dot"></i><small lang="ja">発</small></span>${o.stopIds.map((id,i) => `<span class="cw-line-station ${stopState(o,id,i)}${i === currentCursor(o) ? ' current' : ''}" data-line-stop="${escape(id)}">${i === currentCursor(o) ? '<em lang="ja">次</em>' : ''}<i class="cw-line-dot"></i><small>${i+1}</small>${i === currentCursor(o) ? `<b>${modelText(shortText(stopKind(id).toUpperCase(),12))}</b>` : ''}</span>`).join('')}<span class="cw-line-station endpoint"><i class="cw-line-dot"></i><small lang="ja">着</small></span></div>`;
}
function walkRally(o) {
  return `<aside class="cw-walk-ticket" aria-label="This walk"><h2 class="cw-print cw-walk-ticket-title">This walk</h2><ol class="cw-mini-route"><li><span class="cw-dot" aria-hidden="true" lang="ja">発</span><span class="cw-print">Start</span></li>${o.stopIds.map((id,i) => { const status=stopState(o,id,i), stamped=o.stamps.find(s => s.stopId === id); return `<li class="${status}"${status === 'current' ? ' aria-current="step"' : ''}><span class="cw-dot" aria-hidden="true">${i+1}</span><div><strong>${modelText(stopKind(id))}</strong><small class="cw-print">${status === 'stamped' ? '✓ stamped' : status === 'current' ? '→ current' : status}</small></div>${stamped ? `<span class="cw-mini-seal">${sealHTML(stamped,{current:false,animate:false})}</span>` : ''}</li>`; }).join('')}<li><span class="cw-dot" aria-hidden="true" lang="ja">着</span><span class="cw-print">Finish</span></li></ol><div class="cw-rally" aria-label="This walk's stamps">${o.stopIds.map((id,i) => { const stamped=o.stamps.find(s => s.stopId === id); return stamped ? sealHTML(stamped,{current:false,animate:false}) : emptyStamp(`${i+1} · ${stopKind(id)}`); }).join('')}</div></aside>`;
}
function stamp(o,id,kind,distance = null,announcement = null) {
  if (o.status !== 'active' || o.stamps.some(s => s.stopId === id)) return;
  o.stamps.push({stopId:id,at:now(),kind,distance});
  if (flyer(id)?.bucket !== 'keep' && flyer(id)) state.labels[id]=1;
  recentStamp=id;
  stampMessages.delete(id); save(); render();
  announcer.innerHTML=modelText(announcement ?? `Stamped: ${stopKind(id)}`);
  const target=document.querySelector('.cw-used h2') ?? document.querySelector('[data-action="next-stop"]');
  if (target) { if (target.tagName !== 'BUTTON') target.tabIndex=-1; target.focus({preventScroll:true}); }
  if (kind === 'gps') { try { navigator.vibrate?.(18); } catch {} }
  requestAnimationFrame(() => { recentStamp=null; }); void rank();
}
async function here(o,id,button) {
  const p = stop(id); if (!p) { notify('This stop no longer has a location. Add its printed address in your mailbox.',{tone:'warn'}); return; }
  button.disabled = true; button.setAttribute('aria-busy','true'); button.innerHTML = '<span class="cw-spinner" aria-hidden="true"></span>Checking location…';
  try {
    const position = await new Promise((resolve,reject) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}) : reject(new Error('Location unavailable')));
    const distance = distanceMeters({lat:position.coords.latitude,lon:position.coords.longitude},p);
    if (distance-position.coords.accuracy <= 200) stamp(o,id,'gps',Math.round(distance));
    else { stampMessages.set(id,{distance:Math.round(distance),text:`You're ${Math.round(distance)} m away — keep walking`}); render(); }
  } catch { stamp(o,id,'self',null,`Stamped: ${stopKind(id)}. Location unavailable, so the stamp has a dashed outline.`); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

function shortDate(value) { return formatDate(value).replace(/ \d{4}$/, ''); }
const shortText = (value,limit = 90) => { const text=String(value ?? '').replace(/\s+/g,' ').trim(); return text.length > limit ? text.slice(0,limit-1).trimEnd()+'…' : text; };
const offerDeadline = (f,o) => parseDeadline(o.deadline_text,scanDate(f)) ?? parseDeadline(f.valid_to_text,scanDate(f)) ?? parseDeadline(f.deadline,scanDate(f));
const currentOffers = f => (f.offers ?? []).map((entry,index) => ({entry,index,kind:'offer'})).filter(({entry}) => !offerDeadline(f,entry) || offerDeadline(f,entry) >= japanToday());
const priceItems = f => (f.items ?? []).map((entry,index) => ({entry,index,kind:'item'})).sort((a,b) => (printedValue(b.entry) ?? -1)-(printedValue(a.entry) ?? -1));
const usedEntries = (outings = state.outings) => outings.flatMap(o => o.used.map(u => ({entry:flyer(u.flyerId)?.[u.kind === 'offer' ? 'offers' : 'items']?.[u.index]})));
// Gemma writes kinds in lower case ("dry cleaner"); show them as names.
const capital = value => { const text=String(value ?? ''); return /^[a-z]/.test(text) ? text[0].toUpperCase()+text.slice(1) : text; };
const hasJapanese = value => /[\u3040-\u30ff\u3400-\u9fff]/u.test(String(value ?? ''));
// Escape runs separately so mixed English/Japanese keeps both languages.
const modelText = (value,tag='span') => String(value ?? '').split(/([\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]+[\u3000-\u303f]*)/u)
  .map(run => hasJapanese(run) || /[\uff66-\uff9f]/u.test(run) ? `<${tag} lang="ja">${escape(run)}</${tag}>` : escape(run)).join('');
function flyerTitle(f) {
  const kind=capital(f.business?.kind ?? f.category.replaceAll('_',' ')), name=f.business?.name;
  return `<span>${modelText(kind)}</span>${name ? `<span class="cw-ja">${modelText(name)}</span>` : ''}`;
}
function dealParts(f) {
  const offers=currentOffers(f).map(o => o.entry), entries=[...offers,...(f.items ?? [])].filter(e => printedValue(e) !== null).sort((a,b) => printedValue(b)-printedValue(a));
  const best=entries[0];
  if (!best) return {label:'',price:null,regular:null,value:null,text:shortText(offers[0]?.text_en ?? 'No printed deal')};
  const price=best.offer_yen ?? best.price_yen ?? (best.kind === 'free_trial' ? 0 : null), value=printedValue(best);
  // Keep the bestDeal selection and printed-label trimming used by the existing UI.
  const label=shortText(best.name_en ?? (best.text_en ?? '').split(/(?:normally|regular(?: price)?|now|only|for|at)?\s*[¥￥]|\d[\d,]*\s*(?:円|yen)/i)[0]
    .replace(/[\s→(,:;]+$/,'').replace(/[,\s]*\b(?:normally|usually|regular(?: price)?|now|only|for|at|from)$/i,'').replace(/[\s,]+$/,''),45) || 'Printed deal';
  const regular=best.regular_yen != null && price != null && best.regular_yen>price ? best.regular_yen : null;
  const text=regular !== null ? price === 0 ? `${label}${/free/i.test(label) ? '' : ' · free'} (usually ${money(regular)})` : `${label} ${money(price)} (was ${money(regular)})` : `${label} · ${money(value)} off`;
  return {label,price,regular,value,text};
}
function bestDeal(f) { return dealParts(f).text; }
function stickerHTML(f) {
  const {label,price,regular,value,text}=dealParts(f);
  if (value === null) return `<span class="cw-deal">${modelText(text)}</span>`;
  return `<span class="cw-sticker">${modelText(label)} <b>${regular !== null ? price === 0 ? 'Free' : money(price) : money(value)+' off'}</b>${regular !== null ? ` <s><span class="cw-sr">was </span>${money(regular)}</s>` : ''}</span>`;
}
function revokeThumbs() { for (const url of thumbURLs.values()) URL.revokeObjectURL(url); thumbURLs.clear(); }
function thumbnail(id,large = false) {
  const privatePage=state.flyers.some(f => f.bucket === 'keep' && f.pageIds.includes(id));
  const blob=privatePage ? null : thumbBlobs.get(id);
  if (!blob) return `<span class="cw-thumb cw-placeholder${large ? ' cw-preview' : ''}" role="img" aria-label="No preview for this page">No preview</span>`;
  if (!thumbURLs.has(id)) thumbURLs.set(id,URL.createObjectURL(blob));
  return `<img class="cw-thumb${large ? ' cw-preview' : ''}" src="${escape(thumbURLs.get(id))}" alt="${large ? 'Page preview' : 'Flyer page preview'}">`;
}
function stack(f,interactive = true) {
  if (!f || f.bucket === 'keep') return '';
  interactive=interactive && !f.sample;
  return `<span class="cw-stack">${f.pageIds.slice(0,3).map((id,i) => interactive ? `<button type="button" class="cw-thumb-button" style="--tile:${i}" data-action="page-sheet" data-id="${escape(id)}" aria-label="Open page ${f.pageIds.indexOf(id)+1} of ${escape(f.business?.name ?? 'flyer')}">${thumbnail(id)}</button>` : `<span class="cw-thumb-button" style="--tile:${i}">${thumbnail(id)}</span>`).join('')}</span>`;
}
function pageStatus(p) { return p.status === 'read' ? 'Read' : p.status === 'failed' ? 'Failed' : p.status === 'detailing' ? 'Reading prices' : p.status === 'reading' ? 'Reading' : 'Waiting'; }
function pendingGroups() { return groupPages(Object.values(state.pages).filter(p => !state.flyers.some(f => f.sample && f.pageIds.includes(p.id))),state.overrides).some(g => g.pageIds.some(id => state.pages[id]?.needsMerge) || !state.flyers.some(f => f.pageIds.length === g.pageIds.length && f.pageIds.every(id => g.pageIds.includes(id)))); }
function heroScene() {
  return `<div class="cw-hero-scene" aria-hidden="true"><div class="cw-hero-art">
    <span class="cw-mini cw-pile-1" style="--band:#d40b0b" lang="ja">特売</span><span class="cw-mini cw-pile-2" style="--band:#1d6fb8" lang="ja">体験</span><span class="cw-mini cw-pile-3" style="--band:#13824f" lang="ja">半額</span>
    <svg class="cw-hero-route" viewBox="0 0 100 24" preserveAspectRatio="none"><path d="M0 12 H92" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/><path d="M90 5 L100 12 L90 19" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div class="cw-hero-ticket"><span class="k">Today · your walk</span><b>3 places worth the walk</b><span class="m">2.0 km · 25 min</span><span class="s">Trial <i>¥1,000</i></span>
      <svg class="cw-seal cw-hero-seal" viewBox="0 0 100 100" style="--c:var(--ink-vermilion);--r:-10deg"><g filter="url(#ink)"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="4.2"/><circle cx="50" cy="50" r="39.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path id="hero-arc" d="M 19 52 A 31 31 0 0 1 81 52" fill="none"/><text class="arc"><textPath id="hero-arc-text" href="#hero-arc" startOffset="50%" text-anchor="middle">WORTH THE WALK</textPath></text><text class="mark" x="50" y="64" text-anchor="middle" lang="ja">歩</text><rect x="31" y="69.5" width="38" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><text class="date" x="50" y="77.6" text-anchor="middle">STAMPED</text></g></svg>
    </div></div></div>`;
}
function addPagesCard() {
  const disabled=busy || preparing || recovering, readDisabled=disabled || readUnavailable(), welcome=!state.flyers.length && !photos.length && !reading;
  return `<section class="cw-snap${welcome ? ' cw-welcome' : ''}" aria-label="Photograph flyers">${welcome ? `${heroScene()}<div class="cw-welcome-copy"><p class="cw-print">For the flyers (<span lang="ja">チラシ</span>) in your mailbox</p><${startRequest ? 'h2' : 'h1'}>One good reason to go outside.</${startRequest ? 'h2' : 'h1'}><p class="cw-muted">Photograph the flyers in your mailbox. We'll find the ones worth walking to, plan a short walk past them, and give you a stamp at each stop.</p>` : `<${state.flyers.length || startRequest || reading ? 'h2' : 'h1'}>${state.flyers.length ? 'Add more flyers' : 'Your mailbox'}</${state.flyers.length || startRequest || reading ? 'h2' : 'h1'}>`}<button class="${welcome || state.flyers.length && !candidates().length ? 'cw-primary' : 'cw-secondary'} cw-wide" data-action="take-photo" ${disabled ? 'disabled' : ''}>${welcome ? '<svg class="cw-camera" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>' : ''}Photograph my flyers</button><button class="cw-text cw-wide" data-action="choose-photos" ${disabled ? 'disabled' : ''}>Choose from photos</button>${welcome ? `<div class="cw-sample-invite"><button class="cw-secondary cw-wide" data-action="sample" ${disabled || startRequest ? 'disabled' : ''}>Try a sample mailbox</button><p class="cw-muted">No flyers to hand? Try it with made-up shops.</p></div></div>` : ''}<input id="camera-input" type="file" accept="image/*" capture="environment" hidden><input id="photos-input" type="file" accept="image/*" multiple hidden>${photos.length && !reading ? `<p class="cw-print">${photos.length} ${plural(photos.length,'page','pages')} ready</p><div class="cw-photos" aria-label="Selected pages">${photos.map((p,i) => `<div class="cw-photo" data-rotation="${p.rotation}"><img src="${escape(p.url)}" alt="Page ${i+1} preview"><p class="cw-print">Page ${i+1}</p><div class="cw-photo-controls"><button data-action="rotate" data-id="${escape(p.id)}" aria-label="Rotate page ${i+1}" ${disabled ? 'disabled' : ''}>${rotateIcon}</button><button data-action="remove-photo" data-id="${escape(p.id)}" aria-label="Remove page ${i+1}" ${disabled ? 'disabled' : ''}>${closeIcon}</button></div></div>`).join('')}</div><p class="cw-muted">Add every page of every flyer, then tap Read.</p>` : ''}${preparing ? '<p class="cw-meta" role="status">Preparing photos…</p>' : ''}${photos.length && !reading && !recovered ? `<div class="cw-read-dock"><button class="cw-primary" data-action="read" ${readDisabled || startRequest ? 'disabled' : ''}${readUnavailable() ? ' aria-describedby="read-reason"' : ''}>Read ${photos.length} ${plural(photos.length,'flyer','flyers')}</button>${readUnavailable() ? `<p id="read-reason" class="cw-muted">${offline ? 'Reading flyers needs a connection.' : serviceReason}</p>` : ''}</div>` : ''}${recovered && photos.length && !reading ? resumeCard() : ''}${reading ? readingCard() : ''}</section>`;
}
function resumeCard() {
  const time=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(photos[0].addedAt));
  return `<div class="cw-resume"><p>${photos.length} pages waiting from ${escape(time)}</p>${readUnavailable() ? `<p id="resume-reason" class="cw-muted">${offline ? 'Reading flyers needs a connection.' : serviceReason}</p>` : ''}<div class="cw-actions"><button class="cw-primary" data-action="resume" ${readUnavailable() ? 'disabled aria-describedby="resume-reason"' : ''}>Resume</button><button class="cw-text" data-action="discard">Discard</button></div></div>`;
}
function failedReadingActions() {
  const failed=reading.batch.filter(p => p.status === 'failed'), allFailed=!reading.active && failed.length === reading.batch.length && !reading.completed;
  const commonReason=allFailed && new Set(failed.map(p => p.error)).size === 1 ? failed[0]?.error : '';
  const retryDisabled=readUnavailable() || (busy && (!reading.active || reading.controller.signal.aborted));
  return `${commonReason ? `<p class="cw-meta">${escape(commonReason)}</p>` : ''}${failed.map(p => `<div class="cw-failed-page">${!commonReason ? `<p class="cw-meta">Page ${p.pageNumber}: ${escape(p.error)}</p>` : ''}<button data-action="retry-page" data-id="${escape(p.id)}" ${retryDisabled ? 'disabled' : ''}>Retry page ${p.pageNumber}</button></div>`).join('')}${failed.length >= 2 || allFailed ? `<button class="${allFailed ? 'cw-primary' : 'cw-secondary'} cw-wide" data-action="retry-failed" ${retryDisabled ? 'disabled' : ''}>${allFailed ? 'Retry all' : 'Retry all failed'}</button>` : ''}${!reading.active && photos.length ? `<div class="cw-actions">${!allFailed ? `<button class="cw-primary" data-action="resume" ${readUnavailable() ? 'disabled' : ''}>Resume</button>` : ''}<button data-action="discard">${allFailed ? 'Remove these photos' : 'Discard'}</button></div>` : ''}${readUnavailable() ? `<p id="resume-reason" class="cw-muted">${offline ? 'Reading flyers needs a connection.' : serviceReason}</p>` : ''}`;
}
const allReadingFailed = () => reading && !reading.active && !reading.completed && reading.batch.length > 0 && reading.batch.every(p => p.status === 'failed');
function announceReading() {
  if (!reading) return;
  const done=reading.completed+reading.batch.filter(p => p.status === 'read').length;
  // Seconds/ETA and tile progress stay visual; announce completed pages/state only.
  const key=`${reading.active}:${done}`;
  if (reading.announcement === key) return;
  reading.announcement=key;
  $('progress').textContent=allReadingFailed() ? '' : reading.active ? `Reading flyers. ${done} pages read.` : 'Reading paused. Your unread pages are kept for later.';
}
function readingCard() {
  return `<section id="reading-card" class="cw-reading" aria-labelledby="reading-heading"><${state.flyers.length || startRequest ? 'h2' : 'h1'} id="reading-heading" tabindex="-1" class="cw-sr">Reading your flyers</${state.flyers.length || startRequest ? 'h2' : 'h1'}><div class="cw-progress-line"><label id="reading-count" for="reading-progress"></label><button class="cw-text" data-action="stop-reading" ${!reading.active ? 'hidden' : ''}>Stop</button></div><progress id="reading-progress" aria-label="Flyer reading progress" max="1" value="0"></progress><p id="reading-hint" class="cw-muted">Keep this screen open. Cards appear as each flyer is read.</p><div class="cw-reading-pages">${reading.batch.map((p,i) => `<div class="cw-reading-page" data-reading-page="${escape(p.id)}" data-status="${escape(p.status)}">${p.url ? `<img src="${escape(p.url)}" alt="Page ${p.pageNumber ?? i+1}">` : `<span class="cw-reading-blank" aria-label="Page ${p.pageNumber ?? i+1}">${p.pageNumber ?? i+1}</span>`}<span data-page-status>${pageStatus(p)}${p.status === 'read' ? ' \u2713' : ''}</span></div>`).join('')}</div><p id="reading-message" class="cw-meta">${escape(reading.message)}</p><div id="reading-failures">${failedReadingActions()}</div></section>`;
}
function updateReading() {
  if (!reading || !$('reading-progress')) return;
  const r=reading, calls=r.batch.reduce((n,p) => n+(p.wholeRead ? 1 : 0)+p.parts.size,0), total=r.batch.reduce((n,p) => n+1+(p.detailNeeded ? 6 : 0),0);
  const done=r.completed+r.batch.filter(p => p.status === 'read').length, lanes=Math.min(3,r.batch.filter(p => ['waiting','reading','detailing'].includes(p.status)).length) || 1;
  const average=r.durations.reduce((n,d) => n+d,0)/(r.durations.length || 1);
  // Known groups need one sort each; unread pages conservatively count as separate flyers.
  const pendingGroups=groupPages(Object.values(state.pages).filter(p => p.needsMerge && r.batch.some(b => b.id === p.id)),state.overrides).length;
  const unread=r.batch.filter(p => ['waiting','reading','detailing'].includes(p.status) && !state.pages[p.id]?.needsMerge).length;
  const remaining=Math.max(1,Math.ceil(((average || 15000)*(total-calls)/lanes+5000*(pendingGroups+unread))/60000));
  $('reading-progress').max=total; $('reading-progress').value=calls;
  $('reading-count').textContent=r.active ? `Reading ${Math.min(done+1,r.batch.length)} of ${r.batch.length} · about ${remaining} min left` : `${done} pages read · paused`;
  const allFailed=allReadingFailed();
  $('reading-heading').textContent=allFailed ? 'None of these pages could be read.' : 'Reading your flyers';
  $('reading-heading').classList.toggle('cw-sr',!allFailed);
  $('reading-progress').hidden=allFailed;
  $('reading-count').closest('.cw-progress-line').hidden=allFailed;
  $('reading-hint').hidden=allFailed;
  $('reading-message').textContent=r.batch.some(p => p.status === 'failed') ? '' : r.message;
  announceReading();
  const failures=$('reading-failures'), failureHTML=failedReadingActions();
  if (failures.dataset.html !== failureHTML) { const focus=focusKey(document.activeElement); failures.innerHTML=failureHTML; failures.dataset.html=failureHTML; if (focus && focus.action?.startsWith('retry')) restoreFocus(focus); }
  for (const chip of document.querySelectorAll('[data-reading-page]')) {
    const p=r.batch.find(p => p.id === chip.dataset.readingPage);
    if (!p) continue;
    chip.dataset.status=p.status;
    const status=pageStatus(p)+(p.status === 'read' ? ' \u2713' : '');
    const label=chip.querySelector('[data-page-status]');
    if (label.textContent !== status) label.textContent=status;
  }
  for (const badge of document.querySelectorAll('[data-reading-prices]')) { const f=flyer(badge.dataset.readingPrices); badge.hidden=!r.active || !r.batch.some(p => f?.pageIds.includes(p.id) && p.status === 'detailing'); }
}
function locateControl(f) {
  return addressOpen.has(f.id) ? `<form class="cw-locate" data-locate="${escape(f.id)}"><label class="cw-field">Printed address<input name="address" aria-invalid="${addressErrors.has(f.id)}"${addressErrors.has(f.id) ? ` aria-describedby="address-error-${escape(f.id)}"` : ''} required maxlength="300" autocomplete="street-address" placeholder="Address or business name"></label><button type="submit" ${busy || offline ? 'disabled' : ''}${offline ? ` aria-describedby="address-offline-${escape(f.id)}"` : ''}>Find address</button>${offline ? `<p id="address-offline-${escape(f.id)}" class="cw-inline-reason">Finding an address needs a connection.</p>` : ''}${addressErrors.has(f.id) ? `<p id="address-error-${escape(f.id)}" class="cw-inline-reason" role="status">${modelText(addressErrors.get(f.id))}</p>` : ''}</form>` : '';
}
function stopRow(f,previous=home()) {
  const location=f.location && previous ? `${walkMinutes(distanceMeters(previous,f.location))} min${f.deadline ? ` · until ${shortDate(f.deadline)}` : ''}` : f.location ? '' : f.address ? "Couldn't place this address near your start" : 'No address on the flyer';
  return `<div class="cw-stop-row" data-flyer="${escape(f.id)}">${stack(f)}<button class="cw-row-content" data-action="flyer-sheet" data-id="${escape(f.id)}"><strong>${flyerTitle(f)}</strong>${stickerHTML(f)}<span class="cw-meta">${escape(location)}</span></button><button class="cw-remove" data-action="not-for-me" data-id="${escape(f.id)}" aria-label="Not for me: ${escape(capital(f.business?.kind ?? f.category))}">${closeIcon}</button>${!f.location ? `<div class="cw-row-address"><button class="cw-text" data-action="add-address" data-id="${escape(f.id)}">Add address</button>${locateControl(f)}</div>` : ''}${reading?.batch.some(p => f.pageIds.includes(p.id) && p.status === 'detailing') ? `<p class="cw-meta cw-row-address" data-reading-prices="${escape(f.id)}">Reading prices…</p>` : ''}</div>`;
}
function routeSummary(p) { const e=estimates(p.meters,state.settings.weightKg); return `${(e.routeMeters/1000).toFixed(1)} km · ~${e.minutes} min · ~${e.steps.toLocaleString('en-US')} steps`; }
function stationHTML(point) {
  const station=stations.find(s => s.id === point?.stationId);
  return `${escape(station?.name ?? 'Station')}${station?.ja ? ` <span lang="ja">${escape(station.ja)}</span>` : ''}`;
}
function droppedHTML(p) {
  return p?.dropped?.length ? `<div class="cw-dropped"><p class="cw-muted">${p.dropped.length} ${plural(p.dropped.length,'stop','stops')} didn't fit in ${state.settings.maxMinutes} min: ${modelText(p.dropped.map(s => s.name).join(', '))}</p><div class="cw-actions">${[60,90].filter(n => n>state.settings.maxMinutes).map(n => `<button data-action="extend-walk" data-minutes="${n}">Make it ${n} min</button>`).join('')}</div></div>` : '';
}
function groceryRow(p) {
  return `<div class="cw-stop-row cw-store-row"><div class="cw-row-content"><strong>${modelText(p.name)}</strong><span class="cw-meta">Grocery stop on the way</span></div><button class="cw-store-toggle" data-action="grocery" data-id="${escape(p.id)}" aria-label="Remove grocery stop: ${escape(p.name)}" aria-pressed="true">${closeIcon}</button></div>`;
}
function routeHTML(p,list) {
  if (!p?.stops.length) return `<ol class="cw-stop-list cw-candidates">${list.map(f => `<li>${stopRow(f)}</li>`).join('')}${p?.dropped?.length ? `<li>${droppedHTML(p)}</li>` : ''}</ol>`;
  const onRoute=new Set(p.stops.map(s => s.id)), others=list.filter(f => !onRoute.has(f.id));
  let previous=p.start;
  const rows=p.stops.map((point,i) => { const content=point.flyer ? stopRow(point.flyer,previous) : groceryRow(point); previous=point; return `<li class="cw-route-stop"><span class="cw-dot" aria-hidden="true">${i+1}</span>${content}</li>`; }).join('');
  const start=p.start.here ? 'From where you are' : p.start.stationId === state.settings.home ? 'From '+stationHTML(p.start) : `Take the train to ${escape(stationName(p.start))}, then walk${stations.find(s => s.id === p.start.stationId)?.ja ? ` <span lang="ja">${escape(stations.find(s => s.id === p.start.stationId).ja)}</span>` : ''}`;
  const end=p.end.here ? 'Back to where you started' : (p.end.stationId === state.settings.home ? 'Home · ' : 'Train home from ')+stationHTML(p.end);
  return `<ol class="cw-route cw-stop-list"><li class="cw-route-station"><span class="cw-dot" aria-hidden="true"></span><div class="cw-station">${start}</div></li>${rows}<li class="cw-route-station cw-route-end"><span class="cw-dot" aria-hidden="true"></span><div class="cw-station">${end}</div></li>${others.length ? `<li class="cw-off-route-label cw-print">Not on today's route</li>${others.map(f => `<li class="cw-off-route-row">${stopRow(f)}</li>`).join('')}` : ''}${p.dropped?.length ? `<li class="cw-off-route-row">${droppedHTML(p)}</li>` : ''}</ol>`;
}
function walkSummary(p) {
  if (!p || !p.stops.length && !p.dropped?.length) return '';
  const base=planWithoutGrocery(), suggested=base?.stops.length ? groceryOnTheWay([base.start,...base.stops,base.end],stores)[0]?.store : null;
  const grocery=suggested ? `+ Grocery stop: ${suggested.name}${storePrograms(suggested,japanToday()).includes('waon') && reward(suggested.chain,japanToday())>1 ? ` · ${reward(suggested.chain,japanToday())}× WAON today` : ''}` : '';
  return `<section class="cw-walk-summary" aria-label="Walk summary">${suggested ? `<button class="cw-grocery cw-text" data-action="grocery" data-id="${escape('store:'+suggested.branchId)}" aria-pressed="${Boolean(groceryChoice)}">${modelText(grocery)}</button>` : ''}${p.stops.length && !photos.length && !reading ? '<button class="cw-primary cw-wide" data-action="start">Start the walk →<small aria-hidden="true" lang="ja">改札</small></button>' : p.stops.length ? '<button class="cw-secondary cw-wide" data-action="start">Start the walk →<small aria-hidden="true" lang="ja">改札</small></button>' : ''}</section>`;
}
function planWithoutGrocery() { const choice=groceryChoice; groceryChoice=null; try { return plan(); } finally { groceryChoice=choice; } }
function collapsedRows() {
  const slot=(id,label,one,many) => { const n=state.flyers.filter(f => f.bucket === id).length; return n ? `<button class="cw-slot" data-action="bucket-sheet" data-id="${id}"><em>${label}</em><b>${n}</b><span>${plural(n,one,many)}</span>${state.flyers.some(f => f.sample && f.bucket === id && f.bucket !== "keep") ? `<div class="cw-tray-thumbs">${state.flyers.filter(f => f.sample && f.bucket === id).map(f => stack(f,false)).join("")}</div>` : ""}</button>` : ''; };
  const slots=slot('home','Home','deal to use at home','deals to use at home')+slot('toss','Recycle','flyer to recycle','flyers to recycle')+slot('keep','Keep','letter, not an ad','letters, not ads');
  return slots ? `<section class="cw-mailbox-tray" aria-label="Sorted mailbox"><p class="cw-print">The rest of your mailbox</p><div class="cw-tray" aria-label="The rest of your mailbox">${slots}</div></section>` : '';
}
function emptyWalkReason() {
  if (state.flyers.some(f => f.bucket === 'walk')) return 'The places on these flyers have ended their offers or you said Not for me.';
  const counts=['home','toss','keep'].map(bucket => { const n=state.flyers.filter(f => f.bucket === bucket).length; return n ? `${n} ${bucket === 'home' ? plural(n,'deal','deals')+' to use at home' : bucket === 'toss' ? 'safe to recycle' : plural(n,'letter','letters')+' to keep'}` : ''; }).filter(Boolean);
  return `We read ${state.flyers.length} ${plural(state.flyers.length,'flyer','flyers')}: ${counts.join(', ')}. None is a place to walk to.`;
}
function renderHome() {
  const list=candidates(), p=list.length ? plan() : null, e=p ? estimates(p.meters,state.settings.weightKg) : null;
  const number=String(state.outings.filter(o => o.status === 'done').length+1).padStart(4,'0');
  const answer=state.flyers.length ? `<section class="cw-answer" aria-labelledby="answer-heading"><article class="cw-ticket"><div class="cw-ticket-head"><div class="cw-ticket-kicker"><span>Today · ${escape(shortDate(japanToday()))}</span><span>No. ${number}</span></div><${startRequest ? 'h2' : 'h1'} class="cw-ticket-title" id="answer-heading">${list.length ? `${list.length} ${plural(list.length,'place','places')} worth the walk` : 'No walk today'}</${startRequest ? 'h2' : 'h1'}>${p?.stops.length ? `<div class="cw-ticket-meta">${(e.routeMeters/1000).toFixed(1)} km · ${e.minutes} min · ~${e.steps.toLocaleString('en-US')} steps</div>` : ''}${rankModel === 'tabpfn' ? '<p class="cw-meta">Ordered for you by TabPFN</p>' : ''}</div>${p?.stops.length ? '<p class="cw-muted cw-ticket-hint">Remove any place you don\'t want. Start when you\'re ready.</p>' : ''}${!list.length ? `<p class="cw-muted">${emptyWalkReason()}</p>` : ''}${list.length ? routeHTML(p,list) : ''}${list.length && !p?.stops.length ? '<p class="cw-muted">Add an address to find your route, or try a longer walk in Settings.</p>' : ''}</article>${walkSummary(p)}<div class="cw-tray-anchor">${collapsedRows()}</div>${!list.length ? `<div class="cw-empty-actions">${state.flyers.some(f => f.bucket === 'walk') ? '<button class="cw-text cw-wide" data-action="restore-places">Show places I said Not for me</button>' : ''}${!state.flyers.some(f => f.sample) ? '<button class="cw-text cw-wide" data-action="sample">Try a sample mailbox</button>' : ''}</div>` : ''}${pendingGroups() ? `<button data-action="merge-retry" ${busy ? 'disabled' : ''}>Retry sorting saved readings</button>` : ''}</section>` : '';
  const snapFirst=!(state.flyers.length && !photos.length && !reading);
  const stamps=stampPreview(), side=(snapFirst ? "" : addPagesCard())+(stamps ? `<div class="cw-wide-only">${stamps}</div>` : "");
  const sample=state.flyers.some(f => f.sample) ? '<section class="cw-sample-banner" aria-label="Sample mailbox"><p class="cw-print">Sample mailbox</p><p class="cw-muted">Made-up shops placed near your start.</p><button class="cw-text" data-action="clear-sample">Clear sample</button></section>' : "";
  return `${sample}<div class="cw-home${side || state.flyers.length ? "" : " cw-home-single"}"><div class="cw-home-main">${startChooser()}${snapFirst ? addPagesCard()+(state.flyers.length || photos.length || reading ? answer : firstRunHTML()) : answer}</div>${side || state.flyers.length ? `<aside class="cw-home-side" aria-label="Flyers and stamps">${side}</aside>` : ""}</div>`;
}
// Before the first photo: three steps and a sample ticket (example shops, no real station).
function firstRunHTML() {
  const step=(n,title,text) => `<li><span class="n">${n}</span><div><strong>${title}</strong><p>${text}</p></div></li>`;
  const row=(n,band,print,kind,ja,label,price,was,meta) => `<li class="cw-route-stop"><span class="cw-dot" aria-hidden="true">${n}</span><div class="cw-ex-row"><span class="cw-mini" style="--band:${band}" aria-hidden="true" lang="ja">${print}</span><div class="cw-ex-text"><strong>${kind}<span class="cw-ja" lang="ja">${ja}</span></strong><span class="cw-sticker">${label} <b>${price}</b> <s><span class="cw-sr">was </span>${was}</s></span><span class="cw-meta">${meta}</span></div></div></li>`;
  return `<section class="cw-first-run" aria-labelledby="how-heading"><h2 id="how-heading">How it works</h2><ol class="cw-steps">${step(1,'Photograph the pile','One photo per page. Gemma 4 reads each flyer and sorts it: worth a walk, use at home, keep, or recycle.')}${step(2,'Get a ticket for today','The places worth visiting become one short walk from your start, each with its best printed price.')}${step(3,'Walk and collect stamps',"Tap I'm here at each stop. One GPS reading, checked on your phone, gives you an ink stamp.")}</ol><figure class="cw-example"><figcaption class="cw-print">Example · sample shops</figcaption><div class="cw-ticket cw-example-ticket"><div class="cw-ticket-head"><div class="cw-ticket-kicker"><span>Today</span><span>No. 0001</span></div><p class="cw-ticket-title">3 places worth the walk</p><div class="cw-ticket-meta">2.0 km · 25 min · ~2,850 steps</div></div><ol class="cw-route"><li class="cw-route-station"><span class="cw-dot" aria-hidden="true"></span><div class="cw-station">From your station</div></li>${row(1,'#1d6fb8','体験0円','Pilates studio','さくらピラティス','Trial','¥1,000','¥3,300','6 min · until 30 Oct')}${row(2,'#13824f','半額','Dry cleaner','ほしクリーニング','Shirts','¥98','¥297','9 min · until 31 Oct')}${row(3,'#d40b0b','特売','Supermarket','あおぞら市場','Eggs','¥158','¥198','4 min · today only')}<li class="cw-route-station cw-route-end"><span class="cw-dot" aria-hidden="true"></span><div class="cw-station">Home · your station</div></li></ol></div></figure></section>`;
}
function stampPreview() {
  const stamps=state.outings.flatMap(o => o.stamps);
  if (!stamps.length) return '';
  return `<section class="cw-side-stamps" aria-labelledby="side-stamps"><h2 id="side-stamps">Stamp card</h2><p class="cw-print">${stamps.length} ${plural(stamps.length,'place','places')} stamped</p><div class="cw-rally">${[...stamps].reverse().slice(0,6).map(s => sealHTML(s,{current:false,animate:false})).join('')}</div><button class="cw-secondary cw-wide" data-action="stamps">Open stamp card</button></section>`;
}
function actionsFor(f) {
  if (f.sample === true) return [{text:'Made-up shop — nothing to call.'}];
  const actions=[];
  for (const phone of f.phones ?? []) { const digits=String(phone).normalize('NFKC').replace(/\D/g,''); if (digits) actions.push({kind:'phone',text:`Call ${phone}`,href:'tel:'+digits}); }
  for (const website of f.websites ?? []) {
    try { const text=String(website).trim(), url=new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://'+text.replace(/^\/\//,'')); if (['http:','https:'].includes(url.protocol) && url.hostname) actions.push({kind:'website',text:'Website',href:url.href}); } catch {}
  }
  if ((f.offers ?? []).some(o => ['coupon','discount','campaign'].includes(o.kind))) actions.push({text:'Show this flyer at the counter'});
  const dates=[f.deadline,f.valid_to_text,...(f.offers ?? []).map(o => o.deadline_text)].map(d => parseDeadline(d,scanDate(f))).filter(Boolean).sort();
  if (dates.length) actions.push({text:'Use by '+shortDate(dates.at(-1))});
  return actions;
}
function entryHTML(f,{entry,index,kind}) {
  const name=kind === 'offer' ? entry.text_en ?? 'Printed offer' : entry.name_en ?? 'Printed item';
  const ja=kind === 'offer' ? entry.text_ja : entry.name_ja, price=entry.offer_yen ?? entry.price_yen;
  const value=printedValue(entry), deadline=kind === 'offer' ? offerDeadline(f,entry) : null;
  const meta=[value !== null ? money(value)+' off as printed' : price != null ? money(price) : '',deadline ? 'use by '+shortDate(deadline) : '',...(entry.conditions ?? [])].filter(Boolean);
  return `<div class="cw-entry" data-${kind}-index="${index}"><p><strong>${modelText(name)}</strong></p>${ja ? `<p class="cw-ja" lang="ja">${escape(ja)}</p>` : ''}${value !== null ? stickerHTML({...f,offers:kind === 'offer' ? [entry] : [],items:kind === 'item' ? [entry] : []}) : ''}${meta.length ? `<p class="cw-meta">${modelText(meta.join(' · '))}</p>` : ''}</div>`;
}

function flyerSheet(f) {
  if (!f || f.bucket === 'keep') return '<h2 id="sheet-heading">Letter to keep</h2><p>Nothing from these was saved.</p>';
  const items=priceItems(f), count=Math.max(f.flyer_count ?? 1,...f.pageIds.map(id => state.pages[id]?.tiles?.[0]?.flyer_count ?? 1));
  return `<div class="cw-page-strip">${f.pageIds.map((id,i) => `<${f.sample ? "span" : "button"} class="cw-page-tile"${f.sample ? "" : ` data-action="page-sheet" data-id="${escape(id)}" aria-label="Open page ${i+1}"`}>${thumbnail(id)}</${f.sample ? "span" : "button"}>`).join('')}</div><h2 id="sheet-heading">${flyerTitle(f)}</h2>${count>1 ? `<p class="cw-warning">This photo shows ${escape(count)} flyers. One photo per flyer gives a better reading.</p>` : ''}<section class="cw-how"><h3>How to use</h3>${actionsFor(f).map(a => a.href ? `<a class="cw-link" href="${escape(a.href)}">${modelText(a.text)}</a>` : `<p>${modelText(a.text)}</p>`).join('') || '<p class="cw-muted">Check the printed flyer for instructions.</p>'}</section>${currentOffers(f).slice(0,5).map(e => entryHTML(f,e)).join('')}${(allItems.has(f.id) ? items : items.slice(0,5)).map(e => entryHTML(f,e)).join('')}${items.length>5 ? `<button data-action="all-items" data-id="${escape(f.id)}" aria-expanded="${allItems.has(f.id)}">${allItems.has(f.id) ? 'Show top 5' : 'Show all'}</button>` : ''}<button class="cw-wide" data-action="not-for-me" data-id="${escape(f.id)}">Not for me</button>`;
}
function pageSheet(id) {
  const owner=state.flyers.find(f => f.bucket !== 'keep' && f.pageIds.includes(id)), page=state.pages[id], readingText=page?.tiles?.find(Boolean)?.summary_en;
  if (!owner || !page) return '<h2 id="sheet-heading">Page unavailable</h2>';
  const option=(value,f,label,checked) => `<label class="cw-group-option"><input type="radio" name="belongs" value="${escape(value)}" ${checked ? 'checked' : ''}>${f ? stack(f,false) : '<span class="cw-placeholder cw-own-page" aria-hidden="true">No preview</span>'}<span>${f && value !== owner.id ? flyerTitle(f) : modelText(label)}</span></label>`;
  return `<h2 id="sheet-heading">This page</h2>${thumbnail(id,true)}<p class="cw-page-reading cw-meta">${modelText(shortText(readingText || 'No one-line reading available',150))}</p><form data-page-move="${escape(id)}"><fieldset><legend>This page belongs to:</legend>${option(owner.id,owner,'This flyer',true)}${state.flyers.filter(f => !f.sample && f.id !== owner.id && f.bucket !== 'keep').map(f => option(f.id,f,f.business?.name ?? 'Other flyer',false)).join('')}${option('split',null,'A flyer of its own',false)}</fieldset><button class="cw-primary cw-wide" type="submit" ${busy ? 'disabled' : ''}>Apply</button></form>`;
}
function bucketSheet(bucket) {
  const list=state.flyers.filter(f => f.bucket === bucket);
  if (bucket === 'keep') return `<h2 id="sheet-heading">${list.length} ${plural(list.length,'letter','letters')} to keep</h2><p>Nothing from these was saved.</p>`;
  return `<h2 id="sheet-heading">${list.length} ${bucket === 'home' ? 'deals to order at home' : 'flyers safe to recycle'}</h2>${list.map(f => { const phone=f.sample === true ? null : actionsFor(f).find(a => a.kind === 'phone'); return `<article class="cw-secondary-row">${stack(f)}<button class="cw-row-content" data-action="flyer-sheet" data-id="${escape(f.id)}"><strong>${flyerTitle(f)}</strong><span class="cw-meta">${modelText(bucket === 'home' ? bestDeal(f) : f.comes_to_you ? 'They come to you' : ['buying_service','junk_removal'].includes(f.category) ? 'Only if you need the service' : f.category === 'real_estate' ? 'Property advert' : 'No in-person deal')}</span></button>${bucket === 'home' && phone ? `<a class="cw-link" href="${escape(phone.href)}">Call</a>` : ''}</article>`; }).join('')}`;
}
function stampsContent() {
  const done=state.outings.filter(o => o.status === 'done'), stamps=state.outings.flatMap(o => o.stamps).sort((a,b) => Date.parse(b.at)-Date.parse(a.at)), meters=done.reduce((n,o) => n+o.meters,0), e=estimates(meters,state.settings.weightKg), yen=savings(usedEntries()).yen;
  const month=new Intl.DateTimeFormat('en-GB',{month:'long',timeZone:'Asia/Tokyo'}).format(new Date());
  const stats=[done.length ? `<div><b>${done.length}</b><span>${plural(done.length,'walk','walks')}</span></div>` : '',meters ? `<div><b>${(e.routeMeters/1000).toFixed(1)} km</b><span>~${e.steps.toLocaleString('en-US')} steps</span></div>` : '',yen ? `<div><b class="cw-money">${money(yen)}</b><span>saved, printed on flyers</span></div>` : ''].join('');
  return `<h2 id="sheet-heading">Your stamps</h2><section class="cw-ticket cw-month-rally"><div class="cw-ticket-kicker"><span>Stamp rally · ${month}</span><span>${stamps.length} collected</span></div><div class="cw-rally-head"><h3>${stamps.length} ${plural(stamps.length,'place','places')} stamped</h3><p>Each kind of place has its own ink</p></div><div class="cw-rally">${stamps.map(stampCard).join('')}${Array.from({length:3-stamps.length%3},(_,i) => emptyStamp(i ? '' : 'Next stamp',i>0)).join('')}</div></section>${stats ? `<div class="cw-tally">${stats}</div>` : ''}${stamps.some(s => s.kind === 'self') || meters ? '<p class="cw-small-note">Dashed stamp: stamped without GPS. Distance and steps are estimates from planned routes.</p>' : ''}${!stamps.length ? '<p class="cw-muted">Your first stamp is one walk away.</p><button class="cw-primary cw-wide" data-action="plan-walk">Plan a walk</button>' : ''}${state.outings.length ? `<h3>Past walks</h3>${[...state.outings].reverse().map(o => `<button class="cw-history-item" data-action="past-walk" data-id="${escape(o.id)}"><strong>${formatDate(o.createdAt)} · ${escape(o.status)}</strong><span class="cw-meta">${routeSummary(o)} · ${money(savings(usedEntries([o])).yen)} saved</span></button>`).join('')}` : ''}<h3>All flyers</h3><label class="cw-field">Search flyers<input id="history-search" type="search" value="${escape(historyQuery)}" placeholder="Business name or kind"></label><div id="history-results">${historyResults()}</div>`;
}
function historyResults() {
  const query=historyQuery.toLowerCase(), list=[...state.flyers].reverse().filter(f => f.bucket !== 'keep' && [f.business?.name,f.business?.kind,f.summary_en].join(' ').toLowerCase().includes(query));
  return list.map(f => `<article class="cw-secondary-row" data-history-flyer="${escape(f.id)}">${stack(f)}<button class="cw-row-content" data-action="flyer-sheet" data-id="${escape(f.id)}"><strong>${flyerTitle(f)}</strong><span class="cw-meta">${formatDate(scanDate(f))}${expired(f) ? ' · expired' : ''}</span></button></article>`).join('') || '<p class="cw-muted">No saved flyers match.</p>';
}
function activeOuting() { return state.outings.find(o => o.status === 'active'); }
function currentCursor(o) { return Number.isInteger(o.cursor) && o.cursor >= 0 ? Math.min(o.cursor,o.stopIds.length) : 0; }
function walkSavings(o) {
  const yen=savings(usedEntries([o])).yen;
  return yen>0 ? `<p class="cw-walk-savings"><strong>${money(yen)}</strong> <span>saved on this walk · printed on the flyer</span></p>` : '';
}
function routeLink(f,href) {
  return f?.sample === true ? '' : `<a class="cw-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer">Open route in Google Maps</a>`;
}
function farCard(o,id,f,message,href) {
  return `<section class="cw-far" role="status"><p>You're <strong class="cw-far-distance">${message.distance} m</strong> away — keep walking</p>${routeLink(f,href)}<button class="cw-secondary cw-wide" data-action="stamp-anyway" data-id="${escape(id)}" data-outing="${escape(o.id)}">Stamp anyway</button><p class="cw-small-note">Stamp anyway gives a dashed stamp.</p></section>`;
}
function walkScreen(o) {
  if (!o) { view='home'; return renderHome(); }
  const cursor=currentCursor(o), id=o.stopIds[cursor], p=stop(id), f=p?.flyer, stamped=o.stamps.find(s => s.stopId === id), message=stampMessages.get(id);
  if (cursor>=o.stopIds.length) return doneScreen(o);
  const previous=cursor ? stop(o.stopIds[cursor-1]) ?? o.start : o.start;
  const meters=p ? distanceMeters(previous,p) : 0, minutes=walkMinutes(meters);
  const remaining=o.stopIds.slice(cursor).map(stop).filter(Boolean), href=mapsLink(previous,remaining,o.end);
  const kind=capital(f?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : p?.name ?? 'Stop unavailable')), name=f?.business?.name ?? p?.name;
  return `<section class="cw-walk-mode" data-active-stop="${escape(id)}"><div class="cw-board"><div class="cw-board-next"><span>Next · <span lang="ja">次は</span></span><span>Stop ${cursor+1} / ${o.stopIds.length}</span></div><h1 class="cw-board-name">${modelText(kind)}</h1>${name ? `<div class="cw-board-ja">${modelText(name)}</div>` : ''}<div class="cw-board-line">${minutes} min walk · ${Math.round(meters)} m</div>${lineMap(o)}</div>${!stamped ? `<p class="cw-muted">${f?.sample ? "This place is made up. Tap I'm here, then Stamp anyway to try a stamp." : "Walk there, then tap I'm here."}</p>` : ''}<div class="cw-walk-card">${f ? stack(f) : '<div class="cw-placeholder cw-stack">Grocery stop</div>'}<div>${f ? stickerHTML(f) : ''}${routeLink(f,href)}</div></div>${f ? `<section class="cw-how"><h2>How to use</h2>${actionsFor(f).map(a => a.href ? `<a class="cw-link" href="${escape(a.href)}">${modelText(a.text)}</a>` : `<p>${modelText(a.text)}</p>`).join('') || '<p class="cw-muted">Check the printed flyer for instructions.</p>'}</section>` : ''}${stamped ? `<div class="cw-stamp-result"><p class="cw-print cw-stamp-label">Stamp ${o.stamps.findIndex(s => s.stopId === id)+1} of ${o.stopIds.length} · ${stamped.kind === 'gps' ? 'GPS checked' : 'without GPS'}</p><div class="cw-stamp-arrival">${stampCard(stamped)}</div></div>${f ? usedChips(f,o) : ''}${walkSavings(o)}<button class="cw-primary cw-wide" data-action="next-stop" data-id="${escape(o.id)}">Next stop →</button>` : `<button class="cw-primary cw-wide" data-action="here" data-id="${escape(id)}" data-outing="${escape(o.id)}" ${!p ? 'disabled' : ''}>I'm here<small aria-hidden="true">· stamp</small></button>${message ? farCard(o,id,f,message,href) : ''}${walkSavings(o)}<button class="cw-text cw-wide" data-action="skip-stop" data-id="${escape(o.id)}">Skip this stop</button>`}${walkRally(o)}</section>`;
}
function usedChips(f,o) {
  // Printed savings first; otherwise let people still mark the offer they used (it counts as used, no printed value).
  const printed=[...currentOffers(f),...priceItems(f)].filter(({entry}) => printedValue(entry) !== null), entries=(printed.length ? printed : currentOffers(f)).slice(0,6);
  if (!entries.length) return '';
  return `<section class="cw-used"><h2 id="used-heading" tabindex="-1">Did you use it?</h2><p class="cw-muted">Tap what you used. Only printed prices count as savings.</p><div class="cw-chips">${entries.map(({entry,index,kind}) => {
    const used=o.used.some(u => u.flyerId === f.id && u.kind === kind && u.index === index), name=entry.text_en ?? entry.name_en ?? 'Printed offer', value=printedValue(entry);
    return `<button data-action="used" data-id="${escape(f.id)}" data-kind="${kind}" data-index="${index}" data-outing="${escape(o.id)}" aria-pressed="${used}" aria-label="${escape(name)}${value !== null ? ' · '+money(value) : ''}">${used ? '<span aria-hidden="true">✓ </span>' : ''}${modelText(name)}${value !== null ? `<span class="cw-sticker cw-chip-price"><b>${money(value)}</b></span>` : ''}</button>`;
  }).join('')}</div></section>`;
}
function doneScreen(o=state.outings.at(-1)) {
  if (!o) return renderHome();
  const e=estimates(o.meters,state.settings.weightKg), yen=savings(usedEntries([o])).yen;
  const number=String(Math.max(1,state.outings.indexOf(o)+1)).padStart(4,'0');
  const more=candidates().filter(f => !o.stopIds.includes(f.id) && !state.outings.some(w => w.stamps.some(s => s.stopId === f.id) || (w.skipped ?? []).includes(f.id))).length;
  return `<section class="cw-done"><article class="cw-ticket cw-used-ticket"><div class="cw-ticket-head"><div class="cw-ticket-kicker"><span>Today · ${escape(shortDate(japanToday()))}</span><span>No. ${number}</span></div><h1 class="cw-ticket-title">Walk done</h1><p class="cw-ticket-meta">${(e.routeMeters/1000).toFixed(1)} km · ${e.minutes} min · ~${e.steps.toLocaleString('en-US')} steps</p></div><div class="cw-tally cw-done-tally"><div><b>${o.stamps.length}</b><span>stamps collected</span></div><div><b>${(e.routeMeters/1000).toFixed(1)} km</b><span>walk distance</span></div><div><b>~${e.steps.toLocaleString('en-US')}</b><span>steps · estimate</span></div><div><b>~${e.kcal}</b><span>kcal · estimate</span></div></div>${yen>0 ? `<p class="cw-done-summary"><strong>${money(yen)} saved</strong> <span>printed on the flyers</span></p>` : ''}${sealHTML({stopId:o.id,at:now(),kind:'gps'},{current:false,animate:false,finished:true})}</article><div class="cw-rally" aria-label="This walk's stamps">${o.stamps.map(stampCard).join('')}</div><button class="cw-primary cw-wide" data-action="stamps">See your stamp card</button>${typeof navigator.share === 'function' ? `<button class="cw-secondary cw-wide" data-action="share-walk" data-id="${escape(o.id)}">Share this walk</button>` : ''}<button class="cw-text cw-wide" data-action="home">Back to my mailbox</button>${more ? `<p class="cw-small-note">${more} more ${plural(more,'place is','places are')} still worth the walk.</p>` : ''}</section>`;
}
function focusKey(el) { return el?.dataset.action ? {action:el.dataset.action,id:el.dataset.id,kind:el.dataset.kind,index:el.dataset.index} : el?.id ? {elementId:el.id} : null; }
function restoreFocus(key) {
  if (!key) { focusHeading(); return; }
  const root=$('setup').open ? $('setup') : $('sheet').open ? $('sheet') : document;
  const target=key?.elementId ? $(key.elementId) : [...root.querySelectorAll('[data-action]')].find(el => el.dataset.action === key?.action && el.dataset.id === key?.id && el.dataset.kind === key?.kind && el.dataset.index === key?.index);
  if (target && !target.disabled) target.focus({preventScroll:true}); else focusHeading();
}
// Move the one tray when crossing the desktop breakpoint; its controls stay unique.
const desktopLayout=matchMedia('(min-width:960px)');
const dockObserver=new ResizeObserver(entries => {
  const height=entries[0]?.target.getBoundingClientRect().height ?? 0;
  document.documentElement.style.setProperty('--read-dock-height',height+'px');
});
const noticeObserver=new ResizeObserver(() => {
  document.documentElement.style.setProperty('--notice-height',($('notice').hidden ? 0 : $('notice').getBoundingClientRect().height)+'px');
});
noticeObserver.observe($('notice'));
document.addEventListener('focusin',event => {
  const target=event.target;
  if (!(target instanceof HTMLElement) || target.closest('dialog, .cw-read-dock, #notice')) return;
  requestAnimationFrame(() => {
    if (!target.isConnected) return;
    const obstacles=[document.querySelector('.cw-read-dock'),!$('notice').hidden && $('notice')].filter(Boolean);
    if (obstacles.some(el => target.getBoundingClientRect().bottom > el.getBoundingClientRect().top)) target.scrollIntoView({block:'center'});
  });
});
function placeTray() {
  const tray=document.querySelector('.cw-mailbox-tray'), side=document.querySelector('.cw-home-side'), anchor=document.querySelector('.cw-tray-anchor');
  if (!tray || !anchor) return;
  if (desktopLayout.matches && side) side.insertBefore(tray,side.querySelector('.cw-wide-only'));
  else anchor.append(tray);
}
desktopLayout.addEventListener('change',placeTray);
function render() {
  const focus=focusKey(document.activeElement), focusedInSheet=$('sheet').contains(document.activeElement), locate=document.activeElement?.closest('[data-locate]');
  const address=locate ? {id:locate.dataset.locate,value:locate.querySelector('input').value} : null;
  if ($('start-line')) { startLine=$('start-line').value; startStation=$('start-station').value; }
  revokeThumbs();
  $('panel').setAttribute('aria-label',view === 'home' ? 'Mailbox' : view === 'walk' ? 'Walk' : 'Walk done');
  const hero=$('panel').querySelector('.cw-hero-scene');
  $('panel').innerHTML=view === 'walk' ? walkScreen(activeOuting()) : view === 'done' ? doneScreen() : renderHome();
  // Keep the decorative welcome hero across re-renders so its one-time entrance is never restarted.
  if (hero) $('panel').querySelector('.cw-hero-scene')?.replaceWith(hero);
  document.body.classList.toggle('cw-has-photos',view === 'home' && photos.length>0 && !reading && !recovered);
  document.body.classList.toggle('cw-is-walking',view === 'walk');
  dockObserver.disconnect();
  const dock=document.querySelector('.cw-read-dock');
  document.documentElement.style.setProperty('--read-dock-height',(dock?.getBoundingClientRect().height ?? 0)+'px');
  if (dock) dockObserver.observe(dock);
  placeTray(); availability();
  const stampCount=state.outings.reduce((n,o) => n+o.stamps.length,0), button=$('stamps-button');
  button.querySelector('.cw-stamp-count')?.remove();
  if (stampCount) { const badge=document.createElement('span'); badge.className='cw-stamp-count'; badge.setAttribute('aria-hidden','true'); badge.textContent=stampCount>99 ? '99+' : String(stampCount); button.append(badge); }
  if (sheet) renderSheet();
  updateReading();
  if (address) { const form=[...document.querySelectorAll('[data-locate]')].find(f => f.dataset.locate === address.id); if (form) { form.querySelector('input').value=address.value; form.querySelector('input').focus({preventScroll:true}); } }
  else if (focus && (!$('setup').open || focusedInSheet)) restoreFocus(focus);
}
function focusHeading() { const target=$('sheet').open ? $('sheet') : $('setup').open ? $('setup') : $('panel'); const heading=target.querySelector('h1,h2'); if (heading) { heading.tabIndex=-1; heading.focus({preventScroll:true}); } }
function openSheet(type,id,opener=document.activeElement) {
  if (!$('sheet').open) sheetOpener=focusKey(opener);
  else sheetTrail.push({sheet:{...sheet},opener:focusKey(opener),scrollTop:$('sheet').scrollTop});
  sheet={type,id}; render(); if (!$('sheet').open) $('sheet').showModal(); $('sheet').scrollTop=0; focusHeading();
}
function renderSheet() {
  const body=sheet.type === 'flyer' ? flyerSheet(flyer(sheet.id)) : sheet.type === 'page' ? pageSheet(sheet.id) : sheet.type === 'bucket' ? bucketSheet(sheet.id) : sheet.type === 'past' ? pastWalkSheet(sheet.id) : stampsContent();
  $('sheet').innerHTML=`<div class="cw-sheet-top"><button class="cw-text" data-action="close-sheet" aria-label="Close sheet">${closeIcon}</button></div>${body}`;
}
function pastWalkSheet(id) { const o=state.outings.find(o => o.id === id); return o ? `<h2 id="sheet-heading">Walk · ${formatDate(o.createdAt)}</h2><p class="cw-print">${totals(o)} · ${money(savings(usedEntries([o])).yen)} saved, printed</p><div class="cw-rally">${o.stamps.map(stampCard).join('')}</div>` : '<h2 id="sheet-heading">Walk unavailable</h2>'; }
function closeSheet() {
  const previous=sheetTrail.pop();
  if (previous) { sheet=previous.sheet; render(); $('sheet').scrollTop=previous.scrollTop; restoreFocus(previous.opener); }
  else $('sheet').close();
}
$('sheet').addEventListener('keydown',event => { if (event.key === 'Escape' && !event.isComposing && sheetTrail.length > 0) { event.preventDefault(); closeSheet(); } });
$('sheet').addEventListener('cancel',event => { if (sheetTrail.length) { event.preventDefault(); closeSheet(); } });
$('sheet').addEventListener('close',() => { sheet=null; sheetTrail.length=0; render(); restoreFocus(sheetOpener); sheetOpener=null; });
function renderSetup() {
  if (!setupOpen) { if ($('setup').open) $('setup').close(); return; }
  $('setup').innerHTML=`<div class="cw-sheet-top"><button class="cw-text" data-action="close-setup" aria-label="Close settings">${closeIcon}</button></div><h2 id="setup-heading">Your walk starts here.</h2><p class="cw-muted">${state.settings.home ? 'Starting from '+stationHTML(home() ?? {stationId:state.settings.home}) : state.settings.place ? 'Starting from your location' : 'Choose where you start walking.'}</p><button class="cw-secondary cw-wide" data-action="use-location" ${locatingStart || busy ? 'disabled' : ''}>${locatingStart ? 'Finding your location…' : 'Use my location'}</button><button class="cw-text cw-wide" data-action="pick-station">Pick a station</button><form id="setup-form">${startProblems('setup')}${stationSelects('setup',state.settings.lineId,state.settings.home)}<fieldset><legend>Walk length</legend><div class="cw-radio">${[20,40,60,90].map(n => `<label><input type="radio" name="minutes" value="${n}" ${state.settings.maxMinutes === n ? 'checked' : ''}>${n} min</label>`).join('')}</div></fieldset><fieldset><legend>Appearance</legend><div class="cw-radio cw-radio-appearance">${[['light','Light'],['dark','Dark'],['auto','Match my device']].map(([value,label]) => `<label><input type="radio" name="theme" value="${value}" ${state.settings.theme === value ? 'checked' : ''}>${label}</label>`).join('')}</div></fieldset><details class="cw-more"><summary>More</summary><label class="cw-field">Weight in kg<input id="setup-weight" type="number" min="1" max="500" step="0.1" value="${escape(state.settings.weightKg)}" required></label><p class="cw-meta">For the kcal estimate.</p></details><button class="cw-primary cw-wide" type="submit" ${busy ? 'disabled' : ''}>Save</button></form>${state.flyers.length || state.outings.length ? '<button type="button" class="cw-text cw-danger" data-action="start-fresh">Start fresh: delete my flyers, walks and stamps on this phone</button>' : ''}`;
  $('setup-form').addEventListener('submit',event => {
    event.preventDefault();
    if ($('setup-station').value) { if (!useStation($('setup-line').value,$('setup-station').value)) return; }
    else if ($('setup-line').value) { startError='Choose a station on this line.'; renderSetup(); $('setup-station')?.focus(); return; }
    state.settings.maxMinutes=Number(new FormData(event.target).get('minutes'));
    state.settings.weightKg=Number($('setup-weight').value);
    state.settings.theme=new FormData(event.target).get('theme'); applyTheme();
    save(); groceryChoice=null; setupOpen=false; renderSetup(); notify(); render();
    safely(async () => { await continueStart(); await rank(); });
  });
  if (!$('setup').open) { setupOpener=focusKey(document.activeElement); $('setup').showModal(); }
}
$('setup').addEventListener('close',() => { setupOpen=false; restoreFocus(setupOpener); setupOpener=null; });
async function retryMerge() {
  if (busy) return;
  busy=true; render(); try { await mergeGroups(); } finally { busy=false; render(); }
}
function sampleOffset(h,east,north) {
  const rad=Math.PI/180, arc=Math.hypot(east,north)/6371000, bearing=Math.atan2(east,north), lat=h.lat*rad;
  const next=Math.asin(Math.max(-1,Math.min(1,Math.sin(lat)*Math.cos(arc)+Math.cos(lat)*Math.sin(arc)*Math.cos(bearing))));
  const lon=h.lon*rad+Math.atan2(Math.sin(bearing)*Math.sin(arc)*Math.cos(lat),Math.cos(arc)-Math.sin(lat)*Math.sin(next));
  return {lat:next/rad,lon:((lon/rad+540)%360)-180,source:'sample'};
}
function sampleFlyers(h) {
  const today=japanToday(), date=days => { const d=new Date(today+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
  const offer=(text,regular,price,days,kind='discount') => ({kind,text_en:text,regular_yen:regular,offer_yen:price,deadline_text:date(days)});
  const rows=[
    ['walk','fitness','Pilates studio','さくらピラティス',[offer('Trial',3300,1000,18)],18,-120,240,['0120-000-101']],
    ['walk','cleaning','Dry cleaner','ほしクリーニング',[offer('Shirts',297,98,19)],19,-190,320,[]],
    ['walk','supermarket','Supermarket','あおぞら市場',[],0,-250,410,[]],
    ['walk','lesson','Aikido dojo','わかば合気道場',[offer('Free trial',3300,0,49,'free_trial')],49,-320,530,[]],
    ['home','food_delivery','Sushi delivery','ほし寿司',[{kind:'coupon',text_en:'¥500 off orders over ¥3,000',discount_yen:500,deadline_text:date(19)}],19,-120,240,['0120-000-105']],
    ['toss','buying_service','Gold buyer','きらり買取',[],null,-190,320,[]],
    ['toss','junk_removal','Junk removal','まるごと回収',[],null,-250,410,[]]
  ];
  const flyers=rows.map(([bucket,category,kind,name,offers,days,east,north,phones],i) => ({id:'sample-f'+(i+1),pageIds:['sample-p'+(i+1)],sample:true,bucket,category,business:{name,kind},offers,items:[],phones,websites:[],comes_to_you:bucket === 'toss',delivery:bucket === 'home',deadline:days === null ? null : date(days),location:sampleOffset(h,east,north)}));
  flyers[2].items=[['Eggs','卵 Lサイズ 10個',158,198],['Chicken thigh','国産若鶏もも肉 100g',98,128],['Komatsuna','小松菜 1束',88,128]].map(([name_en,name_ja,price_yen,regular_yen]) => ({name_en,name_ja,price_yen,regular_yen,conditions:[]}));
  return [...flyers,{id:'sample-f8',pageIds:['sample-p8'],sample:true,bucket:'keep',category:'official_or_personal'}];
}
async function drawSampleThumb(f,index) {
  const canvas=document.createElement('canvas'); canvas.width=336; canvas.height=480;
  const ctx=canvas.getContext('2d'), band=['#1d6fb8','#13824f','#d40b0b','#3d3a92','#0e6f82','#725b37','#455c50'][index];
  ctx.fillStyle='#fffdf7'; ctx.fillRect(0,0,336,480);
  ctx.fillStyle=band; ctx.fillRect(0,0,336,88);
  ctx.fillStyle='#fffdf7'; ctx.font='22px "Dela Gothic One", sans-serif'; ctx.fillText(f.business.name,16,54,304);
  ctx.fillStyle=band; ctx.font='48px "Dela Gothic One", sans-serif';
  const price=f.offers[0]?.offer_yen ?? f.offers[0]?.discount_yen;
  ctx.fillText(price === undefined ? 'ご案内' : money(price),22,198,292);
  ctx.fillStyle='#c9c2b2'; for (let y=258;y<=398;y+=28) ctx.fillRect(24,y,y === 398 ? 190 : 288,3);
  ctx.fillStyle='#18222c'; ctx.font='16px sans-serif'; ctx.fillText('Sample · made-up shop',24,450);
  const blob=await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.7));
  canvas.width=canvas.height=0;
  if (!blob) throw new Error('Could not draw the sample flyer.');
  thumbBlobs.set(f.pageIds[0],blob); await photoDB('put',{pageId:f.pageIds[0],blob},'thumbs');
}
async function sampleMailbox() {
  if (busy || preparing || recovering || state.flyers.some(f => f.sample)) return;
  const h=home(); if (!h) { askStart('sample'); return; }
  busy=true; render();
  try {
    await document.fonts.ready;
    const flyers=sampleFlyers(h);
    state.flyers.push(...flyers); save();
    for (const [index,f] of flyers.entries()) if (f.bucket !== 'keep') await drawSampleThumb(f,index);
    chosenStops=null; groceryChoice=null; view='home'; notify();
  } finally { busy=false; render(); focusHeading(); }
}
async function clearSample() {
  const samples=state.flyers.filter(f => f.sample); if (!samples.length) return false;
  const ids=new Set(samples.map(f => f.id));
  if (activeOuting()?.stopIds.some(id => ids.has(id))) view='home';
  state.outings=state.outings.filter(o => !o.stopIds.some(id => ids.has(id)));
  state.flyers=state.flyers.filter(f => !f.sample);
  for (const f of samples) {
    delete state.labels[f.id]; scores.delete(f.id); allItems.delete(f.id); addressOpen.delete(f.id);
    for (const id of f.pageIds) { delete state.pages[id]; delete state.overrides[id]; thumbBlobs.delete(id); await photoDB('delete',id,'thumbs'); }
  }
  chosenStops=null; groceryChoice=null; save(); return true;
}
function newOuting(p) {
  state.outings=state.outings.filter(o => o.status !== 'planned');
  state.outings.push({id:uid('o-'),createdAt:now(),start:p.start,end:p.end,stopIds:p.stops.map(s => s.id),meters:p.meters,minutes:p.minutes,mode:p.mode,status:'active',cursor:0,skipped:[],stamps:[],used:[]});
  save(); view='walk'; render(); focusHeading(); window.scrollTo({top:0,behavior:'instant'});
}
function advance(o,skip=false) { if (!o || o.status !== 'active') return; const cursor=currentCursor(o); if (!skip && !o.stamps.some(s => s.stopId === o.stopIds[cursor])) return; if (skip) o.skipped=[...(o.skipped ?? []),o.stopIds[cursor]]; o.cursor=cursor+1; if (o.cursor>=o.stopIds.length) { o.status='done'; view='done'; } save(); render(); focusHeading(); window.scrollTo({top:0,behavior:'instant'}); }
async function action(button) {
  const id=button.dataset.id;
  switch (button.dataset.action) {
    case 'start-fresh': if (confirm('Delete all flyers, walks, stamps and photos saved on this phone? Your home station stays.')) {
      const next=fresh(); next.settings=state.settings; try { localStorage.setItem(KEY,JSON.stringify(next)); } catch {}
      try { indexedDB.deleteDatabase('worth-the-walk-photos'); } catch {}
      location.reload();
    } break;
    case 'dismiss-saving': savingDismissed=true; availability(); break;
    case 'reload-coordinates': await loadCoordinates(); break;
    case 'restore-places': for (const f of state.flyers.filter(f => f.bucket === 'walk')) if (state.labels[f.id] === 0) delete state.labels[f.id]; chosenStops=null; save(); render(); await rank(); break;
    case 'plan-walk': sheetTrail.length=0; sheetOpener=null; $('sheet').close(); view='home'; render(); focusHeading(); break;
    case 'retry-failed': await retryPages(photos.filter(p => p.status === 'failed').map(p => p.id)); break;
    case 'take-photo': $('camera-input').click(); break;
    case 'choose-photos': $('photos-input').click(); break;
    case 'rotate': if (!busy && !preparing) { const p=photos.find(p => p.id === id); if (!p) break; preparing++; p.rotation=(p.rotation+90)%360; render(); try { await preparePhoto(p); } finally { preparing--; render(); } } break;
    case 'remove-photo': if (!busy && !preparing) { const p=photos.find(p => p.id === id); if (!p) break; URL.revokeObjectURL(p.url); photos=photos.filter(p => p.id !== id); thumbBlobs.delete(id); render(); await Promise.all([photoDB('delete',id),photoDB('delete',id,'thumbs')]); } break;
    case 'read': case 'resume': await readPhotos(); break;
    case 'sample': if (!home()) askStart('sample'); else await sampleMailbox(); break;
    case 'clear-sample': if (!busy) { await clearSample(); view='home'; notify(); render(); focusHeading(); } break;
    case 'use-location': await useLocation(); break;
    case 'pick-station': startPicker=true; render(); (setupOpen ? $('setup-line') : $('start-line'))?.focus(); break;
    case 'use-station': if (useStation($('start-line').value,$('start-station').value)) { notify(); await continueStart(); } break;
    case 'stop-reading': stopReading(); break;
    case 'retry-page': await retryPages([id]); break;
    case 'discard': if (!busy && !preparing) { for (const p of photos) { await photoDB('delete',p.id); if (!state.pages[p.id]) { thumbBlobs.delete(p.id); await photoDB('delete',p.id,'thumbs'); } URL.revokeObjectURL(p.url); } photos=[]; recovered=false; reading=null; if (startRequest?.type === 'read') { startRequest=null; startPicker=false; } render(); } break;
    case 'flyer-sheet': openSheet('flyer',id,button); break;
    case 'page-sheet': openSheet('page',id,button); break;
    case 'bucket-sheet': openSheet('bucket',id,button); break;
    case 'close-sheet': closeSheet(); break;
    case 'close-setup': setupOpen=false; renderSetup(); break;
    case 'not-for-me': if (flyer(id) && flyer(id).bucket !== 'keep') {
      const previous=state.labels[id], place=capital(flyer(id).business?.kind ?? flyer(id).business?.name ?? 'this place');
      state.labels[id]=0; save(); if ($('sheet').open) closeSheet(); render();
      // A mis-tap shouldn't cost a place: offer Undo until the next message.
      notify(`Removed ${place} from today's walk.`,{actionLabel:'Undo',onAction:async () => {
        if (previous === undefined) delete state.labels[id]; else state.labels[id]=previous;
        save(); notify(''); render(); await rank();
      }});
      await rank();
    } break;
    case 'all-items': if (allItems.has(id)) allItems.delete(id); else allItems.add(id); render(); break;
    case 'add-address': addressOpen.add(id); render(); [...document.querySelectorAll('[data-locate]')].find(f => f.dataset.locate === id)?.querySelector('input').focus(); break;
    case 'merge-retry': if (!home()) askStart('merge'); else await retryMerge(); break;
    case 'extend-walk': { const minutes=Number(button.dataset.minutes); if (![60,90].includes(minutes)) break; state.settings.maxMinutes=minutes; save(); render(); break; }
    case 'grocery': groceryChoice=groceryChoice ? null : id; render(); break;
    case 'start': { if (activeOuting()) { view='walk'; render(); break; } const p=plan(); if (p?.stops.length) { newOuting(p); notify(); } break; }
    case 'here': { const o=activeOuting(); if (o && o.stopIds[currentCursor(o)] === id) await here(o,id,button); break; }
    case 'stamp-anyway': { const o=activeOuting(); if (o && o.stopIds[currentCursor(o)] === id) stamp(o,id,'self',stampMessages.get(id)?.distance ?? null); break; }
    case 'used': { const o=activeOuting(); if (!o || !o.stamps.some(s => s.stopId === id)) break; const kind=button.dataset.kind, index=Number(button.dataset.index), entry=flyer(id)?.[kind === 'offer' ? 'offers' : 'items']?.[index]; if (!entry) break; const existing=o.used.find(u => u.flyerId === id && u.kind === kind && u.index === index); if (existing) o.used=o.used.filter(u => u !== existing); else o.used.push({flyerId:id,kind,index}); save(); const focus=focusKey(button); render(); restoreFocus(focus); break; }
    case 'next-stop': advance(activeOuting()); break;
    case 'skip-stop': advance(activeOuting(),true); break;
    case 'stamps': openSheet('stamps',undefined,button); break;
    case 'share-walk': {
      // Text only: distance, number of places and printed savings. No shop names, places or photos.
      const o=state.outings.find(w => w.id === id); if (!o || typeof navigator.share !== 'function') break;
      const km=(estimates(o.meters,state.settings.weightKg).routeMeters/1000).toFixed(1), yen=savings(usedEntries([o])).yen, n=o.stamps.length;
      const text=`I walked ${km} km to ${n} ${plural(n,'place','places')} from the flyers in my mailbox${yen>0 ? `, and saved ${money(yen)} printed on them` : ''}.`;
      try { await navigator.share({title:'Worth the Walk?',text,url:location.origin+'/'}); } catch (error) { if (error?.name !== 'AbortError') notify('Sharing is not available here.',{tone:'warn'}); }
      break;
    }
    case 'past-walk': openSheet('past',id,button); break;
    case 'home': view=activeOuting() ? 'walk' : 'home'; render(); focusHeading(); break;
  }
}
function safely(task) { Promise.resolve().then(task).catch(error => { notify('This could not be completed. Try again.',{tone:'error'}); }); }
document.addEventListener('click',event => { const button=event.target.closest('button'); if (button && !button.disabled && button.dataset.action) safely(() => action(button)); });
$('settings-button').addEventListener('click',() => { setupOpen=true; renderSetup(); });
$('stamps-button').addEventListener('click',() => openSheet('stamps',undefined,$('stamps-button')));
document.addEventListener('change',event => { const input=event.target; if (input.name === 'theme' && input.closest('#setup-form') && ['light','dark','auto'].includes(input.value)) { state.settings.theme=input.value; applyTheme(); save(); } if (input.id === 'start-line') { startLine=input.value; startStation=''; stationOptions('start'); } else if (input.id === 'start-station') startStation=input.value; else if (input.id === 'setup-line') stationOptions('setup'); if (['photos-input','camera-input'].includes(input.id)) { const files=[...input.files]; input.value=''; photoWork=photoWork.catch(() => {}).then(() => addPhotos(files)); safely(() => photoWork); } });
document.addEventListener('input',event => { if (event.target.id === 'history-search') { const start=event.target.selectionStart, end=event.target.selectionEnd; historyQuery=event.target.value; render(); $('history-search').focus({preventScroll:true}); $('history-search').setSelectionRange(start,end); } });
document.addEventListener('submit',event => {
  const form=event.target;
  if (form.dataset.locate) {
    event.preventDefault(); safely(async () => {
      const f=flyer(form.dataset.locate); if (!f || f.sample || f.bucket === 'keep' || offline) return;
      const data=new FormData(form), h=serverHome(), query=new URLSearchParams({q:data.get('address'),name:f.business?.name ?? ''});
      for (const phone of f.phones ?? []) query.append('phone',phone); if (h) { query.set('lat',h.lat); query.set('lon',h.lon); }
      const b=form.querySelector('button'); b.disabled=true;
      try { const result=await api('/api/locate?'+query); if (pointValid(result.location)) { f.location=result.location; f.needsLookup=false; addressOpen.delete(f.id); addressErrors.delete(f.id); save(); notify('Location found. Your walk has been updated.'); render(); await rank(); } else throw new Error('No location'); } catch { addressErrors.set(f.id,"Couldn't find that. Try the address printed on the flyer (住所) or the full business name."); render(); } finally { b.disabled=false; }
    });
  } else if (form.dataset.pageMove) {
    event.preventDefault(); if (busy) return;
    safely(async () => {
      const pageId=form.dataset.pageMove, f=state.flyers.find(f => f.bucket !== 'keep' && f.pageIds.includes(pageId)), value=new FormData(form).get('belongs');
      if (!f || !state.pages[pageId]) return;
      if (value === f.id) { closeSheet(); return; }
      const target=flyer(value); if (value !== 'split' && (!target || target.bucket === 'keep')) return;
      const affected=new Set([...f.pageIds,...(target?.pageIds ?? [])]);
      for (const other of state.flyers) if (other.pageIds.some(id => affected.has(id))) for (const id of other.pageIds) if (state.pages[id]) state.overrides[id]=other.id;
      state.overrides[pageId]=value === 'split' ? uid('split-') : value;
      save(); busy=true; render();
      try {
        await mergeGroups(affected);
        for (const previous of sheetTrail) if (previous.sheet.type === 'flyer' && !flyer(previous.sheet.id)) previous.sheet.id=state.flyers.find(f => f.pageIds.includes(pageId))?.id;
        closeSheet(); notify();
      } finally { busy=false; render(); }
    });
  }
});
document.addEventListener('visibilitychange',() => { if (reading?.active) void acquireWakeLock(reading); });
window.addEventListener('pagehide',() => { stopReading(); void releaseWakeLock(); revokeThumbs(); });
window.addEventListener('offline',() => { offline=true; render(); });
window.addEventListener('online',() => { offline=false; render(); notify('Back online.'); });
applyTheme(); render(); renderSetup();
await recoverPhotos();
await loadCoordinates();
try { const config=await api('/api/config'); $('mode').textContent=config.mode === 'mock' ? 'Demo mode' : ''; }
catch { serviceUnavailable=true; render(); }
save(); await rank();

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
if (document.readyState === 'complete') registerServiceWorker();
else window.addEventListener('load', registerServiceWorker, {once:true});
