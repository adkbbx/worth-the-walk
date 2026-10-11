import {stations, railLines, stationsOnLine, stores} from '/catalog.mjs';
import {groupPages, storable, printedValue, savings, featureRow, parseDeadline, needsDetail} from '/mailbox.mjs';
import {distanceMeters, neighbours, nearestStation, orderStops, planOuting, walkMinutes, estimates, mapsLink, groceryOnTheWay, openStatus} from '/walks.mjs';
import {japanToday, storePrograms, reward} from '/rules.mjs';

const KEY = 'worth-the-walk-v1';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural = (n, one, many) => n === 1 ? one : many;
const money = value => '¥' + Number(value).toLocaleString('en-US');
const uid = prefix => prefix + crypto.randomUUID();
const now = () => new Date().toISOString();
const titles = {walk:'Worth a walk', home:'Deals to use at home', keep:'Keep — not an ad', toss:'Safe to throw away'};
const fresh = () => ({version:1,settings:{lineId:null,home:null,maxMinutes:40,weightKg:60},pages:{},overrides:{},flyers:[],labels:{},outings:[]});
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const pointValid = p => record(p) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180;
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!record(s) || s.version !== 1 || !record(s.settings) || !record(s.pages) || !record(s.overrides) || !record(s.labels) || !Array.isArray(s.flyers) || !Array.isArray(s.outings)) return fresh();
    if (!s.flyers.every(f => record(f) && typeof f.id === 'string' && typeof f.category === 'string' && Array.isArray(f.pageIds) && f.pageIds.every(id => typeof id === 'string') && Object.hasOwn(titles,f.bucket) && (f.bucket === 'keep' || (record(f.business) && Array.isArray(f.offers) && f.offers.every(record) && Array.isArray(f.items) && f.items.every(i => record(i) && Array.isArray(i.conditions)) && (!f.location || pointValid(f.location)))))) return fresh();
    if (!Object.values(s.pages).every(p => record(p) && typeof p.id === 'string' && typeof p.scannedAt === 'string' && Array.isArray(p.tiles) && p.tiles.every(t => t === null || record(t)))) return fresh();
    if (!s.outings.every(o => record(o) && typeof o.id === 'string' && Number.isFinite(Date.parse(o.createdAt)) && Array.isArray(o.stopIds) && o.stopIds.every(id => typeof id === 'string') && Array.isArray(o.used) && Array.isArray(o.stamps) && pointValid(o.start) && pointValid(o.end) && Number.isFinite(o.meters) && Number.isFinite(o.minutes) && ['planned','active','done'].includes(o.status) && o.stamps.every(s => record(s) && typeof s.stopId === 'string' && Number.isFinite(Date.parse(s.at)) && ['gps','self'].includes(s.kind)) && o.used.every(u => record(u) && typeof u.flyerId === 'string' && ['offer','item'].includes(u.kind) && Number.isInteger(u.index) && u.index >= 0))) return fresh();
    const base = fresh();
    base.settings = {lineId:railLines.some(l => l.id === s.settings.lineId) ? s.settings.lineId : null,home:stations.some(x => x.id === s.settings.home) ? s.settings.home : null,maxMinutes:[20,40,60,90].includes(s.settings.maxMinutes) ? s.settings.maxMinutes : 40,weightKg:Number.isFinite(s.settings.weightKg) && s.settings.weightKg > 0 ? s.settings.weightKg : 60};
    base.pages = s.pages; base.overrides = s.overrides; base.flyers = s.flyers.map(storable); base.outings = s.outings;
    base.labels = Object.fromEntries(Object.entries(s.labels).filter(([,v]) => v === 0 || v === 1));
    for (const f of base.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete base.pages[id]; delete base.overrides[id]; }
    return base;
  } catch { return fresh(); }
}
let state = load(), coordinates = [], view = state.outings.some(o => o.status === 'active') ? 'walk' : state.outings.at(-1)?.status === 'done' ? 'done' : 'home', photos = [], busy = false, setupOpen = !state.settings.home;
let scores = new Map(), rankModel = '', rankSequence = 0;
let chosenStops = null, groceryChoice = null, historyQuery = '';
let sheet = null, sheetOpener = null, setupOpener = null;
const sheetTrail = [];
let recentStamp = null;
const thumbBlobs = new Map(), thumbURLs = new Map(), allItems = new Set(), addressOpen = new Set();
let reading = null, preparing = 0, recovering = true, recovered = false, photoStorage = true, wakeLock = null;
let photoWork = Promise.resolve();
const stampMessages = new Map();

function notify(message = '') { $('notice').textContent = message; }
function save() {
  delete state.shoppingList;
  state.flyers = state.flyers.map(storable);
  for (const f of state.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete state.pages[id]; delete state.overrides[id]; thumbBlobs.delete(id); void photoDB('delete',id,'thumbs'); }
  try { localStorage.setItem(KEY,JSON.stringify(state)); return true; }
  catch { notify('Phone storage is full or unavailable. Keep this page open; new changes could not be saved.'); return false; }
}
function home() {
  const point = coordinates.find(s => s.id === state.settings.home);
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? {stationId:point.id,lat:point.lat,lon:point.lon} : null;
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
  const error = new Error(response.status === 429 ? `Reading limit reached for now — try again in ${Math.max(1,Math.ceil(Number(data.retryAfter || response.headers.get('Retry-After')) / 60) || 1)} min` : data.error ?? 'Request failed. Please try again.');
  error.status = response.status;
  return error;
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
  const train = state.flyers.filter(f => f.bucket !== 'keep' && Object.hasOwn(state.labels,f.id)).map(f => ({row:row(f),label:state.labels[f.id]}));
  if (train.length < 6 || new Set(train.map(t => t.label)).size < 2) { scores.clear(); rankModel = ''; render(); return; }
  try {
    const result = await api('/api/rank',{train,predict:state.flyers.filter(f => f.bucket === 'walk').map(f => ({id:f.id,row:row(f)}))});
    if (sequence !== rankSequence) return;
    scores = new Map(result.scores.map(s => [s.id,s.p])); rankModel = result.model; render();
  } catch (error) { if (sequence === rankSequence) notify(error.message); }
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
    notify('Keep this screen open until reading finishes. Photo storage is unavailable.');
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
  preparing++; render();
  try {
    for (const file of files) {
      const photo={id:uid('p-'),file,rotation:0,addedAt:now(),status:'waiting',parts:new Set()};
      try { await preparePhoto(photo); photos.push(photo); render(); }
      catch (error) { notify(error.message ?? 'Could not prepare this photo. Try another image.'); }
    }
  } finally { preparing--; render(); }
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
    if (failed) notify(`${failed} parts could not be read. Check the printed flyer before using an offer.`);
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
  $('progress').textContent = `Read page ${session.batch.indexOf(photo)+1}. ${session.batch.filter(p => p.status === 'read').length} of ${session.batch.length} pages read.`;
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
async function mergeGroups(affected = null,signal) {
  const groups = groupPages(Object.values(state.pages),state.overrides);
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
    const result = await api('/api/merge',{flyerId:old?.id ?? group.id,pages:group.pageIds.map(id => ({id,detailed:Boolean(state.pages[id].detailed),tiles:state.pages[id].tiles})),scanDate:japanToday(),home:home()},signal);
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
function stopReading(message='Reading stopped. Your unread pages are kept for later.') {
  if (!reading?.active) return;
  reading.message=message; reading.controller.abort(); updateReading();
  window.removeEventListener('beforeunload',guardUnload); void releaseWakeLock();
}
async function readPhotos(ids=null) {
  if (!home()) { setupOpen = true; renderSetup(); render(); notify('Choose your home station before reading.'); return; }
  if (!photos.length || busy || preparing || recovering) return;
  const batch=photos.filter(p => !ids || ids.includes(p.id)); if (!batch.length) return;
  busy=true; recovered=false; view='home'; notify();
  const session={batch,queue:[...batch],controller:new AbortController(),active:true,started:performance.now(),durations:[],message:''};
  reading=session;
  for (const p of batch) { p.status='waiting'; p.parts.clear(); p.error=''; p.wholeRead=Boolean(state.pages[p.id]?.detailPending); p.detailNeeded=p.wholeRead; }
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
          session.message=`Your readings are saved. Sorting failed: ${error.message}. Use Retry sorting saved readings.`; notify(session.message);
          if (error.status === 429) stopReading(error.message);
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
          p.status=error.name === 'AbortError' ? 'waiting' : 'failed';
          p.error=error.name === 'AbortError' ? '' : error.message || 'Network failure. Retry this page.';
          if (error.status === 429) stopReading(error.message);
          else if (error.name !== 'AbortError') { session.message='Some pages could not be read. Retry the failed pages.'; notify(p.error); }
          await storePhoto(p);
          $('progress').textContent=`Page ${batch.indexOf(p)+1}: ${pageStatus(p)}${p.error ? '. '+p.error : ''}`;
          updateReading();
        }
      }
    }));
    await mergeWork;
  } finally {
    clearInterval(timer); session.active=false; window.removeEventListener('beforeunload',guardUnload); await releaseWakeLock();
    for (const p of batch.filter(p => p.status === 'read')) URL.revokeObjectURL(p.url);
    // Remove completed rows before revoking their preview URLs on a paused card.
    session.batch=session.batch.filter(p => p.status !== 'read');
    if (!session.batch.length) reading=null;
    busy=false; render();
    if (!reading) { $('progress').textContent=''; focusHeading(); }
    else $('progress').textContent=session.message || 'Reading paused. Your unread pages are kept for later.';
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
  const starts = [h,...neighbours(stations,stationsOnLine,h.stationId,1).map(n => coordinates.find(s => s.id === n.station.id)).filter(Boolean).map(s => ({stationId:s.id,lat:s.lat,lon:s.lon}))];
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
function sealHTML(stamp,{current=true,animate=true} = {}) {
  const p=stop(stamp.stopId), f=p?.flyer, kind=capital(f?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : 'Stamped place'));
  const id=stamp.stopId+':'+stamp.at;
  const hash=[...id].reduce((hash,c) => (hash*31+c.charCodeAt(0)) >>> 0,0), angle=hash%17-8;
  const dojo=/dojo|aikido|karate|judo|kendo|martial|道場/i.test([f?.business?.kind,f?.business?.name,p?.name].join(' '));
  const [mark,ink]=dojo ? ['道','teal'] : ['lesson','fitness'].includes(p?.category) ? ['体','indigo'] : p?.category === 'cleaning' ? ['洗','green'] : p?.category === 'clinic' ? ['医','green'] : ['supermarket','drugstore','shop'].includes(p?.category) ? ['市','vermilion'] : ['restaurant','food_delivery'].includes(p?.category) ? ['食','vermilion'] : p?.category === 'event' ? ['祭','teal'] : ['歩','teal'];
  const arcId='stamp-arc-'+hash+'-'+(++sealRender), label=String(kind).toUpperCase(), date=japanToday(new Date(stamp.at)).replaceAll('-','.');
  return `<svg class="cw-seal${current ? ' cw-stamp' : ''} ${stamp.kind === 'gps' ? 'gps' : 'self'}${animate && recentStamp === stamp.stopId ? ' new' : ''}" viewBox="0 0 100 100" style="--c:var(--ink-${ink});--r:${angle}deg" role="img" aria-label="${escape(kind)} stamp, ${escape(formatDate(stamp.at))}, ${stamp.kind === 'gps' ? 'GPS verified' : 'stamped without GPS'}">
    <g filter="url(#ink)">
      <circle class="outer" cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="4.2"/>
      <circle cx="50" cy="50" r="39.5" fill="none" stroke="currentColor" stroke-width="1.1"/>
      <path id="${arcId}" d="M 19 52 A 31 31 0 0 1 81 52" fill="none"/>
      <text class="arc"${label.length>16 ? ' textLength="86" lengthAdjust="spacingAndGlyphs"' : ''}${hasJapanese(kind) ? ' lang="ja"' : ''}><textPath id="text-${arcId}" href="#${arcId}" startOffset="50%" text-anchor="middle">${escape(label.slice(0,16))}</textPath></text>
      <text class="mark" lang="ja" x="50" y="64" text-anchor="middle">${mark}</text>
      <rect x="31" y="69.5" width="38" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
      <text class="date" x="50" y="77.6" text-anchor="middle">${date}</text>
    </g>
  </svg>`;
}
function stampCard(stamp) {
  const p=stop(stamp.stopId), f=p?.flyer, kind=capital(f?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : 'Stamped place'));
  const name=f?.business?.name ?? p?.name;
  return `<div class="cw-stamp-card" data-stamp="${escape(stamp.stopId)}">${sealHTML(stamp)}<div class="cw-stamp-name">${modelText(kind)}${name ? `<small${hasJapanese(name) ? ' lang="ja"' : ''}>${escape(name)}</small>` : ''}</div><p class="cw-meta">${escape(formatDate(stamp.at))}</p></div>`;
}
function emptyStamp(label='',hidden=false) { return `<div class="cw-spot"${hasJapanese(label) ? ' lang="ja"' : ''}${hidden ? ' aria-hidden="true"' : ''}>${escape(label)}</div>`; }
function walkRally(o) {
  return `<div class="cw-rally" aria-label="This walk's stamps">${o.stopIds.slice(0,5).map((id,i) => { const stamped=o.stamps.find(s => s.stopId === id), p=stop(id); return stamped ? sealHTML(stamped,{current:false,animate:false}) : emptyStamp(`${i+1} · ${capital(p?.flyer?.business?.kind ?? p?.name ?? 'Stop')}`); }).join('')}</div>`;
}
function stamp(o,id,kind,distance = null) {
  if (o.status !== 'active' || o.stamps.some(s => s.stopId === id)) return;
  o.stamps.push({stopId:id,at:now(),kind,distance});
  if (flyer(id)?.bucket !== 'keep' && flyer(id)) state.labels[id]=1;
  recentStamp=id;
  stampMessages.delete(id); save(); render(); requestAnimationFrame(() => { recentStamp=null; }); void rank();
}
async function here(o,id,button) {
  const p = stop(id); if (!p) { notify('This stop no longer has a location.'); return; }
  button.disabled = true; button.textContent = 'Checking location…';
  try {
    const position = await new Promise((resolve,reject) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}) : reject(new Error('Location unavailable')));
    const distance = distanceMeters({lat:position.coords.latitude,lon:position.coords.longitude},p);
    if (distance-position.coords.accuracy <= 200) stamp(o,id,'gps',Math.round(distance));
    else { stampMessages.set(id,{distance:Math.round(distance),text:`You're ${Math.round(distance)} m away — keep walking`}); render(); }
  } catch { stamp(o,id,'self'); notify('Location unavailable. Added a self-reported outline stamp.'); }
  finally { button.disabled = false; }
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
const modelText = value => `<span${hasJapanese(value) ? ' lang="ja"' : ''}>${escape(value)}</span>`;
function flyerTitle(f) {
  const kind=capital(f.business?.kind ?? f.category.replaceAll('_',' ')), name=f.business?.name;
  return `${modelText(kind)}${name ? `<span class="cw-ja"${hasJapanese(name) ? ' lang="ja"' : ''}>${escape(name)}</span>` : ''}`;
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
  return `<span class="cw-stack">${f.pageIds.slice(0,3).map((id,i) => interactive ? `<button type="button" class="cw-thumb-button" style="--tile:${i}" data-action="page-sheet" data-id="${escape(id)}" aria-label="Open page ${f.pageIds.indexOf(id)+1} of ${escape(f.business?.name ?? 'flyer')}">${thumbnail(id)}</button>` : `<span class="cw-thumb-button" style="--tile:${i}">${thumbnail(id)}</span>`).join('')}</span>`;
}
function pageStatus(p) { return p.status === 'read' ? 'Read' : p.status === 'failed' ? 'Failed' : p.status === 'detailing' ? 'Reading prices' : p.status === 'reading' ? 'Reading' : 'Waiting'; }
function pendingGroups() { return groupPages(Object.values(state.pages),state.overrides).some(g => g.pageIds.some(id => state.pages[id]?.needsMerge) || !state.flyers.some(f => f.pageIds.length === g.pageIds.length && f.pageIds.every(id => g.pageIds.includes(id)))); }
function addPagesCard() {
  const disabled=busy || preparing || recovering;
  return `<section class="cw-snap" aria-label="Photograph flyers">${state.flyers.length ? '<h2>Add more flyers</h2>' : '<h1>One good reason to go outside.</h1>'}<p class="cw-muted">Your mailbox, turned into a little walk.</p><button class="${state.flyers.length || photos.length || reading ? 'cw-secondary' : 'cw-primary'} cw-wide" data-action="take-photo" ${disabled ? 'disabled' : ''}>Photograph your flyers</button><button class="cw-text cw-wide" data-action="choose-photos" ${disabled ? 'disabled' : ''}>Choose from photos</button><input id="camera-input" type="file" accept="image/*" capture="environment" hidden><input id="photos-input" type="file" accept="image/*" multiple hidden>${photos.length && !reading ? `<div class="cw-photos" aria-label="Selected pages">${photos.map((p,i) => `<div class="cw-photo" data-rotation="${p.rotation}"><img src="${escape(p.url)}" alt="Page ${i+1} preview"><div class="cw-photo-controls"><button data-action="rotate" data-id="${escape(p.id)}" aria-label="Rotate page ${i+1}" ${disabled ? 'disabled' : ''}>↻</button><button data-action="remove-photo" data-id="${escape(p.id)}" aria-label="Remove page ${i+1}" ${disabled ? 'disabled' : ''}>✕</button></div></div>`).join('')}</div>` : ''}<p class="cw-tip">One photo per page, flat, in good light.</p>${!state.flyers.length ? '<button class="cw-text" data-action="why-open">Why open models?</button>' : ''}${preparing ? '<p class="cw-meta" role="status">Preparing photos…</p>' : ''}${photos.length && !reading && !recovered ? `<div class="cw-read-dock"><button class="cw-primary" data-action="read" ${disabled ? 'disabled' : ''}>Read ${photos.length} ${plural(photos.length,'flyer','flyers')}</button></div>` : ''}${recovered && photos.length && !reading ? resumeCard() : ''}${reading ? readingCard() : ''}</section>`;
}
function resumeCard() {
  const time=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(photos[0].addedAt));
  return `<div class="cw-resume"><p>${photos.length} pages waiting from ${escape(time)}</p><div class="cw-actions"><button class="cw-primary" data-action="resume">Resume</button><button class="cw-text" data-action="discard">Discard</button></div></div>`;
}
function readingCard() {
  return `<section id="reading-card" class="cw-reading" aria-labelledby="reading-heading"><h2 id="reading-heading" tabindex="-1" class="cw-sr">Reading your flyers</h2><div class="cw-progress-line"><label id="reading-count" for="reading-progress"></label><button class="cw-text" data-action="stop-reading" ${!reading.active ? 'hidden' : ''}>Stop</button></div><progress id="reading-progress" max="1" value="0"></progress><p id="reading-message" class="cw-meta">${escape(reading.message)}</p>${reading.batch.filter(p => p.status === 'failed').map(p => `<div class="cw-actions"><p class="cw-meta">${escape(p.error)}</p><button data-action="retry-page" data-id="${escape(p.id)}">Retry page ${reading.batch.indexOf(p)+1}</button></div>`).join('')}${!reading.active && photos.length ? '<div class="cw-actions"><button class="cw-primary" data-action="resume">Resume</button><button data-action="discard">Discard</button></div>' : ''}</section>`;
}
function updateReading() {
  if (!reading || !$('reading-progress')) return;
  const r=reading, calls=r.batch.reduce((n,p) => n+(p.wholeRead ? 1 : 0)+p.parts.size,0), total=r.batch.reduce((n,p) => n+1+(p.detailNeeded ? 6 : 0),0);
  const done=r.batch.filter(p => p.status === 'read').length, lanes=Math.min(3,r.batch.filter(p => ['waiting','reading','detailing'].includes(p.status)).length) || 1;
  const average=r.durations.reduce((n,d) => n+d,0)/(r.durations.length || 1);
  const remaining=Math.max(1,Math.ceil((average || 15000)*(total-calls)/lanes/60000));
  $('reading-progress').max=total; $('reading-progress').value=calls;
  $('reading-count').textContent=r.active ? `Reading ${Math.min(done+1,r.batch.length)} of ${r.batch.length} · about ${remaining} min left` : `${done} pages read · paused`;
  $('reading-message').textContent=r.message;
  for (const badge of document.querySelectorAll('[data-reading-prices]')) { const f=flyer(badge.dataset.readingPrices); badge.hidden=!r.active || !r.batch.some(p => f?.pageIds.includes(p.id) && p.status === 'detailing'); }
}
function locateControl(f) {
  return addressOpen.has(f.id) ? `<form class="cw-locate" data-locate="${escape(f.id)}"><label class="cw-field">Printed address<input name="address" required maxlength="300" autocomplete="street-address" placeholder="Address or business name"></label><button type="submit" ${busy ? 'disabled' : ''}>Find address</button></form>` : '';
}
function stopRow(f,previous=home()) {
  const location=f.location && previous ? `${walkMinutes(distanceMeters(previous,f.location))} min${f.deadline ? ` · until ${shortDate(f.deadline)}` : ''}` : 'No location yet';
  return `<div class="cw-stop-row" data-flyer="${escape(f.id)}">${stack(f)}<button class="cw-row-content" data-action="flyer-sheet" data-id="${escape(f.id)}"><strong>${flyerTitle(f)}</strong>${stickerHTML(f)}<span class="cw-meta">${escape(location)}</span></button><button class="cw-remove" data-action="not-for-me" data-id="${escape(f.id)}" aria-label="Not for me" title="Not for me">✕</button>${!f.location ? `<div class="cw-row-address"><button class="cw-text" data-action="add-address" data-id="${escape(f.id)}">Add address</button>${locateControl(f)}</div>` : ''}${reading?.batch.some(p => f.pageIds.includes(p.id) && p.status === 'detailing') ? `<p class="cw-meta cw-row-address" data-reading-prices="${escape(f.id)}">Reading prices…</p>` : ''}</div>`;
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
  return `<div class="cw-stop-row cw-store-row"><div class="cw-row-content"><strong>${modelText(p.name)}</strong><span class="cw-meta">Grocery stop on the way</span></div><button class="cw-store-toggle" data-action="grocery" data-id="${escape(p.id)}" aria-label="Remove grocery stop" aria-pressed="true">✕</button></div>`;
}
function routeHTML(p,list) {
  if (!p?.stops.length) return `<ol class="cw-stop-list cw-candidates">${list.map(f => `<li>${stopRow(f)}</li>`).join('')}${p?.dropped?.length ? `<li>${droppedHTML(p)}</li>` : ''}</ol>`;
  const onRoute=new Set(p.stops.map(s => s.id)), others=list.filter(f => !onRoute.has(f.id));
  let previous=p.start;
  const rows=p.stops.map((point,i) => { const content=point.flyer ? stopRow(point.flyer,previous) : groceryRow(point); previous=point; return `<li class="cw-route-stop"><span class="cw-dot" aria-hidden="true">${i+1}</span>${content}</li>`; }).join('');
  const start=p.start.stationId === state.settings.home ? 'From '+stationHTML(p.start) : `Take the train to ${escape(stationName(p.start))}, then walk${stations.find(s => s.id === p.start.stationId)?.ja ? ` <span lang="ja">${escape(stations.find(s => s.id === p.start.stationId).ja)}</span>` : ''}`;
  const end=(p.end.stationId === state.settings.home ? 'Home · ' : 'Train home from ')+stationHTML(p.end);
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
  const slot=(id,label,one,many) => { const n=state.flyers.filter(f => f.bucket === id).length; return n ? `<button class="cw-slot" data-action="bucket-sheet" data-id="${id}"><em>${label}</em><b>${n}</b><span>${plural(n,one,many)}</span></button>` : ''; };
  const slots=slot('home','Home','deal to use at home','deals to use at home')+slot('toss','Recycle','flyer to recycle','flyers to recycle')+slot('keep','Keep','letter, not an ad','letters, not ads');
  return slots ? `<div class="cw-tray" aria-label="The rest of your mailbox">${slots}</div>` : '';
}
function renderHome() {
  const list=candidates(), p=plan(), e=p ? estimates(p.meters,state.settings.weightKg) : null;
  const number=String(state.outings.filter(o => o.status === 'done').length+1).padStart(4,'0');
  const answer=state.flyers.length ? `<section class="cw-answer" aria-labelledby="answer-heading"><article class="cw-ticket"><div class="cw-ticket-head"><div class="cw-ticket-kicker"><span>Today · ${escape(shortDate(japanToday()))}</span><span>No. ${number}</span></div><h2 class="cw-ticket-title" id="answer-heading">${list.length ? `${list.length} ${plural(list.length,'place','places')} worth the walk` : 'Nothing worth a walk this time'}</h2>${p?.stops.length ? `<div class="cw-ticket-meta">${(e.routeMeters/1000).toFixed(1)} km · ${e.minutes} min · ~${e.steps.toLocaleString('en-US')} steps</div>` : ''}${rankModel === 'tabpfn' ? '<p class="cw-meta">Ordered for you by TabPFN</p>' : ''}</div>${!list.length ? `<p class="cw-muted">${state.flyers.some(f => f.bucket === 'walk') ? 'The walk offers are expired, closed, or marked Not for me.' : 'These pages have no in-person deals to walk to.'}</p>` : ''}${routeHTML(p,list)}${list.length && !p?.stops.length ? '<p class="cw-muted">Add an address to find your route, or try a longer walk in Settings.</p>' : ''}</article>${walkSummary(p)}${collapsedRows()}${pendingGroups() ? `<button data-action="merge-retry" ${busy ? 'disabled' : ''}>Retry sorting saved readings</button>` : ''}</section>` : '';
  // Phones get one column; wide screens show the stamp card and the why-open stub beside the ticket.
  const snapFirst=!(state.flyers.length && !photos.length && !reading);
  const wide=`<div class="cw-wide-only">${stampPreview()}<section class="cw-side-why" aria-labelledby="side-why"><p class="cw-print" id="side-why">Why open models? · <span lang="ja">オープンだから、できること</span></p>${whyStub()}</section></div>`;
  return `<div class="cw-home"><div class="cw-home-main">${snapFirst ? addPagesCard()+answer : answer}</div><aside class="cw-home-side" aria-label="Stamps and why open models">${snapFirst ? '' : addPagesCard()}${wide}</aside></div>`;
}
function stampPreview() {
  const stamps=state.outings.flatMap(o => o.stamps);
  if (!stamps.length) return '';
  return `<section class="cw-side-stamps" aria-labelledby="side-stamps"><h2 id="side-stamps">Stamp card</h2><p class="cw-print">${stamps.length} ${plural(stamps.length,'place','places')} stamped</p><div class="cw-rally">${[...stamps].reverse().slice(0,6).map(s => sealHTML(s,{current:false,animate:false})).join('')}</div><button class="cw-secondary cw-wide" data-action="stamps">Open stamp card</button></section>`;
}
function actionsFor(f) {
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
  const value=printedValue(entry);
  return `<div class="cw-entry" data-${kind}-index="${index}"><p><strong>${modelText(name)}</strong></p>${ja ? `<p class="cw-ja" lang="ja">${escape(ja)}</p>` : ''}${value !== null ? stickerHTML({...f,offers:kind === 'offer' ? [entry] : [],items:kind === 'item' ? [entry] : []}) : price != null ? `<p class="cw-meta">${money(price)}</p>` : ''}${value !== null ? `<p class="cw-value">${money(value)} saving printed on the flyer</p>` : ''}${entry.conditions?.length ? `<p class="cw-meta">${modelText(entry.conditions.join(' · '))}</p>` : ''}${kind === 'offer' && offerDeadline(f,entry) ? `<p class="cw-meta">Use by ${shortDate(offerDeadline(f,entry))}</p>` : ''}</div>`;
}
function flyerSheet(f) {
  if (!f || f.bucket === 'keep') return '<h2 id="sheet-heading">Letter to keep</h2><p>Nothing from these was saved.</p>';
  const items=priceItems(f), count=Math.max(f.flyer_count ?? 1,...f.pageIds.map(id => state.pages[id]?.tiles?.[0]?.flyer_count ?? 1));
  return `<div class="cw-page-strip">${f.pageIds.map((id,i) => `<button class="cw-page-tile" data-action="page-sheet" data-id="${escape(id)}" aria-label="Open page ${i+1}">${thumbnail(id)}</button>`).join('')}</div><h2 id="sheet-heading">${flyerTitle(f)}</h2>${count>1 ? `<p class="cw-warning">This photo shows ${escape(count)} flyers. One photo per flyer gives a better reading.</p>` : ''}<section class="cw-how"><h3>How to use</h3>${actionsFor(f).map(a => a.href ? `<a class="cw-link" href="${escape(a.href)}">${modelText(a.text)}</a>` : `<p>${modelText(a.text)}</p>`).join('') || '<p class="cw-muted">Check the printed flyer for instructions.</p>'}</section>${currentOffers(f).slice(0,5).map(e => entryHTML(f,e)).join('')}${(allItems.has(f.id) ? items : items.slice(0,5)).map(e => entryHTML(f,e)).join('')}${items.length>5 ? `<button data-action="all-items" data-id="${escape(f.id)}" aria-expanded="${allItems.has(f.id)}">${allItems.has(f.id) ? 'Show top 5' : 'Show all'}</button>` : ''}<button class="cw-wide" data-action="not-for-me" data-id="${escape(f.id)}">Not for me</button>`;
}
function pageSheet(id) {
  const owner=state.flyers.find(f => f.bucket !== 'keep' && f.pageIds.includes(id)), page=state.pages[id], readingText=page?.tiles?.find(Boolean)?.summary_en;
  if (!owner || !page) return '<h2 id="sheet-heading">Page unavailable</h2>';
  const option=(value,f,label,checked) => `<label class="cw-group-option"><input type="radio" name="belongs" value="${escape(value)}" ${checked ? 'checked' : ''}>${f ? stack(f,false) : '<span class="cw-placeholder cw-own-page" aria-hidden="true">No preview</span>'}<span>${f && value !== owner.id ? flyerTitle(f) : modelText(label)}</span></label>`;
  return `<h2 id="sheet-heading">This page</h2>${thumbnail(id,true)}<p class="cw-page-reading cw-meta">${modelText(shortText(readingText || 'No one-line reading available',150))}</p><form data-page-move="${escape(id)}"><fieldset><legend>This page belongs to:</legend>${option(owner.id,owner,'This flyer',true)}${state.flyers.filter(f => f.id !== owner.id && f.bucket !== 'keep').map(f => option(f.id,f,f.business?.name ?? 'Other flyer',false)).join('')}${option('split',null,'A flyer of its own',false)}</fieldset><button class="cw-primary cw-wide" type="submit" ${busy ? 'disabled' : ''}>Apply</button></form>`;
}
function bucketSheet(bucket) {
  const list=state.flyers.filter(f => f.bucket === bucket);
  if (bucket === 'keep') return `<h2 id="sheet-heading">${list.length} ${plural(list.length,'letter','letters')} to keep</h2><p>Nothing from these was saved.</p>`;
  return `<h2 id="sheet-heading">${list.length} ${bucket === 'home' ? 'deals to order at home' : 'flyers safe to recycle'}</h2>${list.map(f => { const phone=actionsFor(f).find(a => a.kind === 'phone'); return `<article class="cw-secondary-row">${stack(f)}<button class="cw-row-content" data-action="flyer-sheet" data-id="${escape(f.id)}"><strong>${flyerTitle(f)}</strong><span class="cw-meta">${modelText(bucket === 'home' ? bestDeal(f) : f.comes_to_you ? 'They come to you' : ['buying_service','junk_removal'].includes(f.category) ? 'Only if you need the service' : f.category === 'real_estate' ? 'Property advert' : 'No in-person deal')}</span></button>${bucket === 'home' && phone ? `<a class="cw-link" href="${escape(phone.href)}">Call</a>` : ''}</article>`; }).join('')}`;
}
function stampsContent() {
  const done=state.outings.filter(o => o.status === 'done'), stamps=state.outings.flatMap(o => o.stamps).sort((a,b) => Date.parse(b.at)-Date.parse(a.at)), meters=done.reduce((n,o) => n+o.meters,0), e=estimates(meters,state.settings.weightKg), yen=savings(usedEntries()).yen;
  const month=new Intl.DateTimeFormat('en-GB',{month:'long',timeZone:'Asia/Tokyo'}).format(new Date());
  const stats=[done.length ? `<div><b>${done.length}</b><span>${plural(done.length,'walk','walks')}</span></div>` : '',meters ? `<div><b>${(e.routeMeters/1000).toFixed(1)} km</b><span>~${e.steps.toLocaleString('en-US')} steps</span></div>` : '',yen ? `<div><b class="cw-money">${money(yen)}</b><span>saved, printed on flyers</span></div>` : ''].join('');
  return `<h2 id="sheet-heading">Your stamps</h2><p class="cw-print">Stamp rally · ${month}</p><div class="cw-rally-head"><h3>${stamps.length} ${plural(stamps.length,'place','places')} stamped</h3><p>Each kind of place has its own ink</p></div><div class="cw-rally">${stamps.map(stampCard).join('')}${emptyStamp('Next stamp')+emptyStamp('',true)+emptyStamp('',true)}</div>${stats ? `<div class="cw-tally">${stats}</div>` : ''}${stamps.some(s => s.kind === 'self') || meters ? '<p class="cw-small-note">Dashed stamp: stamped without GPS. Distance and steps are estimates from planned routes.</p>' : ''}${!stamps.length ? '<p class="cw-muted">Your first walk starts with a flyer.</p>' : ''}${state.outings.length ? `<h3>Past walks</h3>${[...state.outings].reverse().map(o => `<button class="cw-history-item" data-action="past-walk" data-id="${escape(o.id)}"><strong>${formatDate(o.createdAt)} · ${escape(o.status)}</strong><span class="cw-meta">${routeSummary(o)} · ${money(savings(usedEntries([o])).yen)} saved</span></button>`).join('')}` : ''}<h3>All flyers</h3><label class="cw-field">Search flyers<input id="history-search" type="search" value="${escape(historyQuery)}" placeholder="Business name or kind"></label><div id="history-results">${historyResults()}</div>`;
}
function whySheet() { return `<h2 id="sheet-heading">Why open models?</h2><p class="cw-print" lang="ja">オープンだから、できること</p>${whyStub()}`; }
function whyStub() {
  return `<div class="cw-stub"><h3>Your mail is read by models anyone can run</h3><ol class="cw-reasons">
    <li><span class="n">1</span><div><strong>You choose where your mail is read.</strong> <p>The same Gemma 4 family reads flyers on a hosted GPU or on your own laptop (<em>LOCAL_LLM=1</em>). A closed API has no run-it-at-home option.</p></div></li>
    <li><span class="n">2</span><div><strong>We could check it on real flyers.</strong> <p>With open weights we tested both sizes on the same flyers: the small model got <em>0/8</em> prices from a whole page, the large one <em>4/4</em> from a tile. That is why price lists are read tile by tile.</p></div></li>
    <li><span class="n">3</span><div><strong>It costs about half a yen a page.</strong> <p>Reading one page costs roughly <em>¥0.4</em> on serverless inference. A whole mailbox is a few yen, with no account and no subscription.</p></div></li>
    <li><span class="n">4</span><div><strong>It learns your taste without your data.</strong> <p>TabPFN ranks flyers from your ✕ and stamps using only numbers (kind of place, distance, deal size). Names, addresses and photos never go to it.</p></div></li>
  </ol><p class="cw-small-note">Addresses come from Japan's open GSI geocoder; photos are read and deleted; nothing is stored on a server.</p></div>`;
}
function historyResults() {
  const query=historyQuery.toLowerCase(), list=[...state.flyers].reverse().filter(f => f.bucket !== 'keep' && [f.business?.name,f.business?.kind,f.summary_en].join(' ').toLowerCase().includes(query));
  return list.map(f => `<article class="cw-secondary-row" data-history-flyer="${escape(f.id)}">${stack(f)}<button class="cw-row-content" data-action="flyer-sheet" data-id="${escape(f.id)}"><strong>${flyerTitle(f)}</strong><span class="cw-meta">${formatDate(scanDate(f))}${expired(f) ? ' · expired' : ''}</span></button></article>`).join('') || '<p class="cw-muted">No saved flyers match.</p>';
}
function activeOuting() { return state.outings.find(o => o.status === 'active'); }
function currentCursor(o) { return Number.isInteger(o.cursor) && o.cursor >= 0 ? Math.min(o.cursor,o.stopIds.length) : 0; }
function walkScreen(o) {
  if (!o) { view='home'; return renderHome(); }
  const cursor=currentCursor(o), id=o.stopIds[cursor], p=stop(id), f=p?.flyer, stamped=o.stamps.find(s => s.stopId === id), message=stampMessages.get(id);
  if (cursor>=o.stopIds.length) return doneScreen(o);
  const previous=cursor ? stop(o.stopIds[cursor-1]) ?? o.start : o.start;
  const meters=p ? distanceMeters(previous,p) : 0, minutes=walkMinutes(meters);
  const remaining=o.stopIds.slice(cursor).map(stop).filter(Boolean);
  const kind=capital(f?.business?.kind ?? (p?.category === 'supermarket' ? 'Supermarket' : p?.name ?? 'Stop unavailable')), name=f?.business?.name ?? p?.name;
  return `<section class="cw-walk-mode" data-active-stop="${escape(id)}"><div class="cw-board" role="status"><div class="cw-board-next"><span>Next · <span lang="ja">次は</span></span><span>Stop ${cursor+1} / ${o.stopIds.length}</span></div><h1 class="cw-board-name">${modelText(kind)}</h1>${name ? `<div class="cw-board-ja"${hasJapanese(name) ? ' lang="ja"' : ''}>${escape(name)}</div>` : ''}<div class="cw-board-line">${minutes} min walk · ${Math.round(meters)} m</div></div><div class="cw-walk-card">${f ? stack(f) : '<div class="cw-placeholder cw-stack">Grocery stop</div>'}<div>${f ? stickerHTML(f) : ''}<a class="cw-link" href="${escape(mapsLink(previous,remaining,o.end))}" target="_blank" rel="noopener noreferrer">Open route in Google Maps</a></div></div>${f ? `<section class="cw-how"><h2>How to use</h2>${actionsFor(f).map(a => a.href ? `<a class="cw-link" href="${escape(a.href)}">${modelText(a.text)}</a>` : `<p>${modelText(a.text)}</p>`).join('') || '<p class="cw-muted">Check the printed flyer for instructions.</p>'}</section>` : ''}${stamped ? `<div class="cw-stamp-arrival">${stampCard(stamped)}</div>${f ? usedChips(f,o) : ''}<button class="cw-primary cw-wide" data-action="next-stop" data-id="${escape(o.id)}">Next stop →</button>` : `<button class="cw-primary cw-wide" data-action="here" data-id="${escape(id)}" data-outing="${escape(o.id)}" ${!p ? 'disabled' : ''}>I'm here<small aria-hidden="true">· stamp</small></button>${message ? `<p class="cw-warning" role="status">${escape(message.text)}</p><button class="cw-wide" data-action="stamp-anyway" data-id="${escape(id)}" data-outing="${escape(o.id)}">Stamp anyway</button>` : ''}<button class="cw-text cw-wide" data-action="skip-stop" data-id="${escape(o.id)}">Skip this stop</button>`}${walkRally(o)}</section>`;
}
function usedChips(f,o) {
  // Printed savings first; otherwise let people still mark the offer they used (it counts as used, no printed value).
  const printed=[...currentOffers(f),...priceItems(f)].filter(({entry}) => printedValue(entry) !== null), entries=(printed.length ? printed : currentOffers(f)).slice(0,6);
  if (!entries.length) return '';
  return `<section class="cw-used"><h2>Did you use it?</h2><div class="cw-chips">${entries.map(({entry,index,kind}) => { const used=o.used.some(u => u.flyerId === f.id && u.kind === kind && u.index === index); return `<button data-action="used" data-id="${escape(f.id)}" data-kind="${kind}" data-index="${index}" data-outing="${escape(o.id)}" aria-pressed="${used}">${used ? '✓ ' : ''}${modelText(entry.text_en ?? entry.name_en ?? 'Printed offer')}${printedValue(entry) !== null ? ' · '+money(printedValue(entry)) : ''}</button>`; }).join('') || '<p class="cw-meta">No printed saving to count.</p>'}</div></section>`;
}
function doneScreen(o=state.outings.at(-1)) {
  if (!o) return renderHome();
  return `<section class="cw-done"><h1>Walk done</h1><p class="cw-done-summary">${routeSummary(o)}<strong>${money(savings(usedEntries([o])).yen)} saved <small>printed on the flyers</small></strong></p><div class="cw-rally">${o.stamps.map(stampCard).join('')}</div><button class="cw-primary cw-wide" data-action="stamps">Your stamps</button><button class="cw-text cw-wide" data-action="home">Back to my mailbox</button></section>`;
}
function focusKey(el) { if (el?.dataset.action === 'why-open') return {action:'why-open',footer:Boolean(el.closest('.cw-footer'))}; return el?.dataset.action ? {action:el.dataset.action,id:el.dataset.id,index:el.dataset.index} : el?.id ? {elementId:el.id} : null; }
function restoreFocus(key) {
  const root=$('setup').open ? $('setup') : $('sheet').open ? $('sheet') : document;
  const target=key?.elementId ? $(key.elementId) : [...root.querySelectorAll('[data-action]')].find(el => el.dataset.action === key?.action && el.dataset.id === key?.id && el.dataset.index === key?.index && (key?.action !== 'why-open' || Boolean(el.closest('.cw-footer')) === key.footer));
  if (target && !target.disabled) target.focus({preventScroll:true}); else focusHeading();
}
function render() {
  const focus=focusKey(document.activeElement), focusedInSheet=$('sheet').contains(document.activeElement), locate=document.activeElement?.closest('[data-locate]');
  const address=locate ? {id:locate.dataset.locate,value:locate.querySelector('input').value} : null;
  revokeThumbs();
  $('panel').setAttribute('aria-label',view === 'home' ? 'Mailbox' : view === 'walk' ? 'Walk' : 'Walk done');
  $('panel').innerHTML=view === 'walk' ? walkScreen(activeOuting()) : view === 'done' ? doneScreen() : renderHome();
  document.body.classList.toggle('cw-has-photos',view === 'home' && photos.length>0 && !reading && !recovered);
  document.body.classList.toggle('cw-is-walking',view === 'walk');
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
  const body=sheet.type === 'flyer' ? flyerSheet(flyer(sheet.id)) : sheet.type === 'page' ? pageSheet(sheet.id) : sheet.type === 'bucket' ? bucketSheet(sheet.id) : sheet.type === 'past' ? pastWalkSheet(sheet.id) : sheet.type === 'why' ? whySheet() : stampsContent();
  $('sheet').innerHTML=`<div class="cw-sheet-top"><button class="cw-text" data-action="close-sheet" aria-label="Close sheet">✕</button></div>${body}`;
}
function pastWalkSheet(id) { const o=state.outings.find(o => o.id === id); return o ? `<h2 id="sheet-heading">Walk · ${formatDate(o.createdAt)}</h2><p class="cw-print">${totals(o)} · ${money(savings(usedEntries([o])).yen)} saved, printed</p><div class="cw-rally">${o.stamps.map(stampCard).join('')}</div>` : '<h2 id="sheet-heading">Walk unavailable</h2>'; }
function closeSheet() {
  const previous=sheetTrail.pop();
  if (previous) { sheet=previous.sheet; render(); $('sheet').scrollTop=previous.scrollTop; restoreFocus(previous.opener); }
  else $('sheet').close();
}
$('sheet').addEventListener('cancel',event => { if (sheetTrail.length) { event.preventDefault(); closeSheet(); } });
$('sheet').addEventListener('close',() => { sheet=null; sheetTrail.length=0; render(); restoreFocus(sheetOpener); sheetOpener=null; });
function renderSetup() {
  if (!setupOpen) { if ($('setup').open) $('setup').close(); return; }
  $('setup').innerHTML=`<div class="cw-sheet-top">${state.settings.home ? '<button class="cw-text" data-action="close-setup" aria-label="Close settings">✕</button>' : ''}</div><h2 id="setup-heading">Your walk starts here.</h2><form id="setup-form"><label class="cw-field">Train line<select id="setup-line" required><option value="">Choose a line</option>${railLines.map(l => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join('')}</select></label><label class="cw-field">Home station<select id="setup-station" required><option value="">Choose a station</option></select></label><fieldset><legend>Walk length</legend><div class="cw-radio">${[20,40,60,90].map(n => `<label><input type="radio" name="minutes" value="${n}" ${state.settings.maxMinutes === n ? 'checked' : ''}>${n} min</label>`).join('')}</div></fieldset><details class="cw-more"><summary>More</summary><label class="cw-field">Weight in kg<input id="setup-weight" type="number" min="1" max="500" step="0.1" value="${escape(state.settings.weightKg)}" required></label><p class="cw-meta">For the kcal estimate.</p></details><button class="cw-primary cw-wide" type="submit" ${busy ? 'disabled' : ''}>Save</button></form>${state.flyers.length || state.outings.length ? '<button type="button" class="cw-text cw-danger" data-action="start-fresh">Start fresh: delete my flyers, walks and stamps on this phone</button>' : ''}`;
  $('setup-line').value=state.settings.lineId ?? ''; stationOptions(state.settings.home);
  $('setup-line').addEventListener('change',() => stationOptions(null));
  $('setup-form').addEventListener('submit',event => {
    event.preventDefault(); const stationId=$('setup-station').value, point=coordinates.find(s => s.id === stationId);
    if (!pointValid(point)) { notify('Station coordinates are unavailable. Reload to try again.'); return; }
    state.settings={lineId:$('setup-line').value,home:stationId,maxMinutes:Number(new FormData(event.target).get('minutes')),weightKg:Number($('setup-weight').value)};
    save(); groceryChoice=null; setupOpen=false; renderSetup(); notify(); render(); void rank();
  });
  if (!$('setup').open) { setupOpener=focusKey(document.activeElement); $('setup').showModal(); }
}
function stationOptions(selected) { $('setup-station').innerHTML='<option value="">Choose a station</option>'+stationsOnLine(stations,$('setup-line').value).map(s => `<option value="${escape(s.id)}">${escape(s.name)}</option>`).join(''); $('setup-station').value=selected ?? ''; }
$('setup').addEventListener('cancel',event => { if (!state.settings.home) event.preventDefault(); });
$('setup').addEventListener('close',() => { setupOpen=false; restoreFocus(setupOpener); setupOpener=null; });
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
    case 'take-photo': $('camera-input').click(); break;
    case 'choose-photos': $('photos-input').click(); break;
    case 'rotate': if (!busy && !preparing) { const p=photos.find(p => p.id === id); if (!p) break; preparing++; p.rotation=(p.rotation+90)%360; render(); try { await preparePhoto(p); } finally { preparing--; render(); } } break;
    case 'remove-photo': if (!busy && !preparing) { const p=photos.find(p => p.id === id); if (!p) break; URL.revokeObjectURL(p.url); photos=photos.filter(p => p.id !== id); thumbBlobs.delete(id); render(); await Promise.all([photoDB('delete',id),photoDB('delete',id,'thumbs')]); } break;
    case 'read': case 'resume': await readPhotos(); break;
    case 'stop-reading': stopReading(); break;
    case 'retry-page': { const p=photos.find(p => p.id === id); if (!p || p.status !== 'failed') break; if (reading?.active && !reading.controller.signal.aborted) { p.status='waiting'; p.error=''; p.parts.clear(); reading.queue.push(p); updateReading(); } else await readPhotos([id]); break; }
    case 'discard': if (!busy && !preparing) { for (const p of photos) { await photoDB('delete',p.id); if (!state.pages[p.id]) { thumbBlobs.delete(p.id); await photoDB('delete',p.id,'thumbs'); } URL.revokeObjectURL(p.url); } photos=[]; recovered=false; reading=null; render(); } break;
    case 'flyer-sheet': openSheet('flyer',id,button); break;
    case 'page-sheet': openSheet('page',id,button); break;
    case 'why-open': openSheet('why',undefined,button); break;
    case 'bucket-sheet': openSheet('bucket',id,button); break;
    case 'close-sheet': closeSheet(); break;
    case 'close-setup': setupOpen=false; renderSetup(); break;
    case 'not-for-me': if (flyer(id) && flyer(id).bucket !== 'keep') { state.labels[id]=0; save(); if ($('sheet').open) closeSheet(); render(); await rank(); } break;
    case 'all-items': if (allItems.has(id)) allItems.delete(id); else allItems.add(id); render(); break;
    case 'add-address': addressOpen.add(id); render(); [...document.querySelectorAll('[data-locate]')].find(f => f.dataset.locate === id)?.querySelector('input').focus(); break;
    case 'merge-retry': if (!busy) { busy=true; render(); try { await mergeGroups(); } finally { busy=false; render(); } } break;
    case 'extend-walk': { const minutes=Number(button.dataset.minutes); if (![60,90].includes(minutes)) break; state.settings.maxMinutes=minutes; save(); render(); break; }
    case 'grocery': groceryChoice=groceryChoice ? null : id; render(); break;
    case 'start': { if (activeOuting()) { view='walk'; render(); break; } const p=plan(); if (p?.stops.length) { newOuting(p); notify(); } break; }
    case 'here': { const o=activeOuting(); if (o && o.stopIds[currentCursor(o)] === id) await here(o,id,button); break; }
    case 'stamp-anyway': { const o=activeOuting(); if (o && o.stopIds[currentCursor(o)] === id) stamp(o,id,'self',stampMessages.get(id)?.distance ?? null); break; }
    case 'used': { const o=activeOuting(); if (!o || !o.stamps.some(s => s.stopId === id)) break; const kind=button.dataset.kind, index=Number(button.dataset.index), entry=flyer(id)?.[kind === 'offer' ? 'offers' : 'items']?.[index]; if (!entry || printedValue(entry) === null) break; const existing=o.used.find(u => u.flyerId === id && u.kind === kind && u.index === index); if (existing) o.used=o.used.filter(u => u !== existing); else o.used.push({flyerId:id,kind,index}); save(); render(); break; }
    case 'next-stop': advance(activeOuting()); break;
    case 'skip-stop': advance(activeOuting(),true); break;
    case 'stamps': openSheet('stamps',undefined,button); break;
    case 'past-walk': openSheet('past',id,button); break;
    case 'home': view=activeOuting() ? 'walk' : 'home'; render(); focusHeading(); break;
  }
}
function safely(task) { Promise.resolve().then(task).catch(error => { notify(error.message ?? 'Something went wrong. Try again.'); }); }
document.addEventListener('click',event => { const button=event.target.closest('button'); if (button && !button.disabled && button.dataset.action) safely(() => action(button)); });
$('settings-button').addEventListener('click',() => { setupOpen=true; renderSetup(); });
$('stamps-button').addEventListener('click',() => openSheet('stamps',undefined,$('stamps-button')));
document.addEventListener('change',event => { const input=event.target; if (['photos-input','camera-input'].includes(input.id)) { const files=[...input.files].filter(f => f.type.startsWith('image/')); input.value=''; photoWork=photoWork.catch(() => {}).then(() => addPhotos(files)); safely(() => photoWork); } });
document.addEventListener('input',event => { if (event.target.id === 'history-search') { const start=event.target.selectionStart, end=event.target.selectionEnd; historyQuery=event.target.value; render(); $('history-search').focus({preventScroll:true}); $('history-search').setSelectionRange(start,end); } });
document.addEventListener('submit',event => {
  const form=event.target;
  if (form.dataset.locate) {
    event.preventDefault(); safely(async () => {
      const f=flyer(form.dataset.locate); if (!f || f.bucket === 'keep') return;
      const data=new FormData(form), h=home(), query=new URLSearchParams({q:data.get('address'),name:f.business?.name ?? ''});
      for (const phone of f.phones ?? []) query.append('phone',phone); if (h) { query.set('lat',h.lat); query.set('lon',h.lon); }
      const b=form.querySelector('button'); b.disabled=true;
      try { const result=await api('/api/locate?'+query); if (pointValid(result.location)) { f.location=result.location; f.needsLookup=false; addressOpen.delete(f.id); save(); notify('Location found. Your walk has been updated.'); render(); await rank(); } else notify('No location found. Try the printed address or full business name.'); } finally { b.disabled=false; }
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
render(); renderSetup();
await recoverPhotos();
try { const response=await fetch('/station-coordinates.json'); if (!response.ok) throw new Error(); coordinates=await response.json(); render(); }
catch { notify('Station coordinates could not be loaded. Reload to set up or plan a walk.'); }
try { const config=await api('/api/config'); $('mode').textContent=config.mode === 'mock' ? 'Demo mode' : ''; }
catch { notify('Reading service unavailable. Try reloading.'); }
save(); await rank();
