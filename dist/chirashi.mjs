import {stations, railLines, stationsOnLine, stores, walletOptions} from '/catalog.mjs';
import {groupPages, storable, printedValue, savings, featureRow, parseDeadline} from '/mailbox.mjs';
import {distanceMeters, neighbours, planOuting, walkMinutes, estimates, mapsLink, groceryOnTheWay, openStatus} from '/walks.mjs';
import {japanToday, storePrograms, reward, nextBonus} from '/rules.mjs';

const KEY = 'chirashi-walk-v1';
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
    base.settings = {lineId:railLines.some(l => l.id === s.settings.lineId) ? s.settings.lineId : null,home:stations.some(x => x.id === s.settings.home) ? s.settings.home : null,maxMinutes:[20,40,60].includes(s.settings.maxMinutes) ? s.settings.maxMinutes : 40,weightKg:Number.isFinite(s.settings.weightKg) && s.settings.weightKg > 0 ? s.settings.weightKg : 60};
    base.pages = s.pages; base.overrides = s.overrides; base.flyers = s.flyers.map(storable); base.outings = s.outings;
    base.labels = Object.fromEntries(Object.entries(s.labels).filter(([,v]) => v === 0 || v === 1));
    for (const f of base.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete base.pages[id]; delete base.overrides[id]; }
    return base;
  } catch { return fresh(); }
}
let state = load(), coordinates = [], tab = 'mailbox', photos = [], busy = false, setupOpen = !state.settings.home;
let scores = new Map(), rankModel = '', rankSequence = 0;
let chosenStops = null, groceryChoice = null, shoppingList = new Set(), historyQuery = '', historyDetail = null;
const stampMessages = new Map();
function notify(message = '') { $('notice').textContent = message; }
function save() {
  state.flyers = state.flyers.map(storable);
  for (const f of state.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete state.pages[id]; delete state.overrides[id]; }
  try { localStorage.setItem(KEY,JSON.stringify(state)); }
  catch { notify('Phone storage is full or unavailable. Keep this page open; new changes could not be saved.'); }
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
function mailboxStat() {
  const count = bucket => state.flyers.filter(f => f.bucket === bucket).length;
  return `${state.flyers.length} ${plural(state.flyers.length,'flyer','flyers')} sorted → ${count('walk')} ${plural(count('walk'),'outing','outings')}, ${count('home')} ${plural(count('home'),'deal','deals')}, ${count('toss')} safe to throw away`;
}
function row(f) { const h = home(); return featureRow(f,{today:japanToday(),distanceMeters:h && f.location ? distanceMeters(h,f.location) : null}); }
async function api(path, body) {
  const response = await fetch(path,body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(response.status === 429 ? `Reading limit reached. Try again in ${data.retryAfter ?? 60} seconds.` : data.error ?? 'Request failed. Please try again.');
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
function personalNote() {
  const n = state.flyers.filter(f => f.bucket !== 'keep' && Object.hasOwn(state.labels,f.id)).length;
  return rankModel ? `based on your ${n} ${plural(n,'choice','choices')} (${rankModel === 'tabpfn' ? 'TabPFN' : 'simple rules'})` : n < 6 ? 'Rate 6 flyers to personalise' : 'Choose both 👍 and 👎 to personalise';
}
function renderSetup() {
  $('setup').hidden = !setupOpen;
  if (!setupOpen) return;
  $('setup').innerHTML = `<div class="cw-setup"><h1 id="setup-heading">Your walk starts here.</h1><p class="cw-muted">Choose the station you want to walk home to.</p><form id="setup-form"><label class="cw-field">Train line<select id="setup-line" required><option value="">Choose a line</option>${railLines.map(l => `<option lang="ja" value="${escape(l.id)}">${escape(l.name)} · ${escape(l.ja)}</option>`).join('')}</select></label><label class="cw-field">Home station<select id="setup-station" required><option value="">Choose a station</option></select></label><fieldset><legend>Walk length</legend><div class="cw-radio">${[20,40,60].map(n => `<label class="cw-check"><input type="radio" name="minutes" value="${n}" ${state.settings.maxMinutes === n ? 'checked' : ''}>${n} min</label>`).join('')}</div></fieldset><label class="cw-field">Weight in kg<input id="setup-weight" type="number" min="1" max="500" step="0.1" value="${escape(state.settings.weightKg)}" required></label><p class="cw-muted">Used only for the kcal estimate.</p><div class="cw-actions"><button class="cw-primary" type="submit" ${busy ? 'disabled' : ''}>Save</button>${state.settings.home ? '<button type="button" data-action="close-setup">Cancel</button>' : ''}</div></form></div>`;
  $('setup-line').value = state.settings.lineId ?? ''; stationOptions(state.settings.home);
  $('setup-line').addEventListener('change',() => stationOptions(null));
  $('setup-form').addEventListener('submit',event => {
    event.preventDefault();
    const stationId = $('setup-station').value, point = coordinates.find(s => s.id === stationId);
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) { notify('Station coordinates are unavailable. Reload to try again.'); return; }
    state.settings = {lineId:$('setup-line').value,home:stationId,maxMinutes:Number(new FormData(event.target).get('minutes')),weightKg:Number($('setup-weight').value)};
    save(); setupOpen = false; chosenStops = null; groceryChoice = null; notify(); renderSetup(); render(); void rank();
  });
}
function stationOptions(selected) {
  $('setup-station').innerHTML = '<option value="">Choose a station</option>' + stationsOnLine(stations,$('setup-line').value).map(s => `<option lang="ja" value="${escape(s.id)}">${escape(s.name)} · ${escape(s.ja)}</option>`).join('');
  $('setup-station').value = selected ?? '';
}
function rating(f) {
  if (f.bucket === 'keep') return '';
  return `<div class="cw-actions"><span class="cw-muted">Interested?</span>${[1,0].map(v => `<button type="button" data-action="rate" data-id="${escape(f.id)}" data-label="${v}" aria-label="${v ? 'Interested' : 'Not interested'} in this flyer" aria-pressed="${state.labels[f.id] === v}">${v ? '👍' : '👎'}</button>`).join('')}</div>`;
}
function valueLine(entry) { const value = printedValue(entry); return value === null ? '' : `<p class="cw-value">worth ${money(value)} as printed</p>`; }
function entryList(f,outing = null) {
  const selected = (kind,index) => outing?.used?.some(u => u.flyerId === f.id && u.kind === kind && u.index === index);
  const control = (kind,index) => outing ? `<label class="cw-check"><input type="checkbox" data-used="${escape(f.id)}" data-kind="${kind}" data-index="${index}" data-outing="${escape(outing.id)}" ${selected(kind,index) ? 'checked' : ''}>${kind === 'offer' ? 'Used it' : 'Bought it'}</label>` : kind === 'item' ? `<label class="cw-check"><input type="checkbox" data-shopping="${escape(f.id)}" data-index="${index}" ${shoppingList.has(f.id + ':' + index) ? 'checked' : ''}>add to my walk list</label>` : '';
  const offers = (f.offers ?? []).map((o,i) => {
    const deadline = parseDeadline(o.deadline_text,scanDate(f));
    return `<div class="cw-entry"><p>${escape(o.text_en ?? 'Printed offer')}</p>${o.text_ja ? `<p lang="ja" class="cw-muted">${escape(o.text_ja)}</p>` : ''}${o.offer_yen != null ? `<p>${money(o.offer_yen)}</p>` : ''}${valueLine(o)}${deadline ? `<p class="cw-meta">${formatDate(deadline)}${deadline < japanToday() ? ' · expired' : ''}</p>` : o.deadline_text ? `<p lang="ja" class="cw-meta">${escape(o.deadline_text)}</p>` : ''}${control('offer',i)}</div>`;
  }).join('');
  const items = (f.items ?? []).map((item,i) => `<div class="cw-entry"><p><strong>${escape(item.name_en ?? 'Item')}</strong> <span lang="ja">${escape(item.name_ja)}</span></p><p>${money(item.price_yen)}${item.price_tax_incl_yen != null ? ` · ${money(item.price_tax_incl_yen)} incl. tax` : ''}${item.unit ? ` <span lang="ja">/ ${escape(item.unit)}</span>` : ''}</p>${item.regular_yen != null ? `<p class="cw-muted">Printed comparison: ${money(item.regular_yen)} <span lang="ja">${escape(item.regular_label)}</span></p>` : ''}${valueLine(item)}${item.conditions?.length ? `<p class="cw-muted">${escape(item.conditions.join(' · '))}</p>` : ''}${control('item',i)}</div>`).join('');
  return offers + items;
}
function locationLine(f) {
  const l = f.location;
  if (l?.source === 'gsi') return '<p class="cw-meta">📍 found from the printed address</p>';
  if (l?.source === 'serpapi') return `<p class="cw-meta">📍 found on Google Maps${l.place?.rating != null ? ` — ★${escape(l.place.rating)} (${escape(l.place.reviews ?? 0)})` : ''}${l.place?.phoneMatches ? ' · phone matches the flyer ✓' : ''}</p>`;
  if (l) return '<p class="cw-meta">📍 demo location near your selected station</p>';
  return `<form data-locate="${escape(f.id)}"><label class="cw-field">No address — type one<input name="address" required maxlength="300" placeholder="Printed address or business name"></label><button type="submit" ${busy ? 'disabled' : ''}>Find address</button></form>`;
}
function fixControl(f) {
  if (!f.pageIds.some(id => state.pages[id])) return `<p class="cw-meta">${f.pageIds.length} ${plural(f.pageIds.length,'page','pages')}</p><p class="cw-muted">Personal text and page readings have been discarded.</p>`;
  return `<details><summary>${f.pageIds.length} ${plural(f.pageIds.length,'page','pages')} · Fix pages</summary><form data-fix="${escape(f.id)}">${f.pageIds.map((id,index) => `<label class="cw-field">Page ${index + 1}<select name="${escape(id)}"><option value="keep">Keep in this flyer</option>${state.flyers.filter(other => other.id !== f.id && other.bucket !== 'keep').map(other => `<option value="${escape(other.id)}">Move to ${escape(other.business?.name ?? 'another flyer')}</option>`).join('')}<option value="split">Split into new flyer</option></select></label>`).join('')}<button type="submit" ${busy ? 'disabled' : ''}>Save pages &amp; re-read groups</button></form></details>`;
}
function pendingGroups() {
  return groupPages(Object.values(state.pages),state.overrides).some(g => !state.flyers.some(f => f.pageIds.length === g.pageIds.length && f.pageIds.every(id => g.pageIds.includes(id))));
}
function flyerCard(f) {
  const reason = f.category === 'buying_service' ? 'Buying service — they come to you; only if you need it' : f.category === 'junk_removal' ? 'Removal service — keep only if you need it' : f.category === 'real_estate' ? 'Property advert — keep only if you need it' : 'No in-person deal to walk to';
  return `<article class="cw-card" data-flyer="${escape(f.id)}"><h3${f.business?.name ? ' lang="ja"' : ''}>${escape(f.business?.name ?? (f.bucket === 'keep' ? 'Personal or official mail' : 'Flyer'))}${f.business?.branch ? ` <span class="cw-branch">${escape(f.business.branch)}</span>` : ''}</h3><p class="cw-kind">${escape(f.business?.kind ?? f.category?.replaceAll('_',' '))}${expired(f) ? ' · expired' : ''}</p>${scores.has(f.id) ? `<p class="cw-meta">Likely for you · ${Math.round(scores.get(f.id)*100)}%</p>` : ''}${f.summary_en ? `<p>${escape(f.summary_en)}</p>` : ''}${f.bucket === 'toss' ? `<p class="cw-muted">${reason}</p>` : ''}${f.deadline ? `<p class="cw-meta">Until ${formatDate(f.deadline)}${expired(f) ? ' · expired' : ''}</p>` : ''}${fixControl(f)}${f.bucket === 'keep' ? '<p class="cw-muted">Keep the original. Personal details are not saved.</p>' : entryList(f) + (f.bucket === 'walk' ? locationLine(f) : '')}${rating(f)}</article>`;
}
function renderMailbox() {
  const bucket = key => {
    const list = key === 'walk' ? sortedWalks() : state.flyers.filter(f => f.bucket === key);
    const heading = `${titles[key]} <span class="cw-count">${list.length}</span>`;
    const content = list.length ? list.map(flyerCard).join('') : '<p class="cw-muted">No flyers here yet.</p>';
    return key === 'toss' ? `<details class="cw-bucket" data-bucket="toss"><summary>${heading}</summary>${content}</details>` : `<section class="cw-bucket" data-bucket="${key}"><h2>${heading}</h2>${content}</section>`;
  };
  return `<h1>Your mailbox, sorted.</h1><p class="cw-muted">Read the flyers. Keep the useful ones. Find a reason to walk.</p><div class="cw-scan"><h2>Add today's pages</h2><div class="cw-actions"><button type="button" data-action="take-photo" ${busy ? 'disabled' : ''}>Take photo</button><button type="button" data-action="choose-photos" ${busy ? 'disabled' : ''}>Choose photos</button></div><input id="camera-input" type="file" accept="image/*" capture="environment" hidden><input id="photos-input" type="file" accept="image/*" multiple hidden><div class="cw-photos">${photos.map((p,i) => `<div class="cw-photo"><div class="cw-photo-preview"><img src="${escape(p.url)}" alt="Page ${i + 1} preview" style="transform:rotate(${p.rotation}deg)"></div><div class="cw-actions"><button data-action="rotate" data-id="${escape(p.id)}" aria-label="Rotate page ${i + 1}" ${busy ? 'disabled' : ''}>↻</button><button data-action="remove-photo" data-id="${escape(p.id)}" aria-label="Remove page ${i + 1}" ${busy ? 'disabled' : ''}>✕</button></div></div>`).join('')}</div>${photos.length ? `<div class="cw-actions"><button class="cw-primary" data-action="read" ${busy ? 'disabled' : ''}>Read ${photos.length} ${plural(photos.length,'page','pages')}</button></div>` : '<p class="cw-muted">Each photo is one page. Rotate it before reading.</p>'}</div><p id="mailbox-stat" class="cw-meta">${mailboxStat()}</p><p id="personal-note" class="cw-meta">${personalNote()}</p>${Object.keys(titles).map(bucket).join('')}${pendingGroups() ? '<button data-action="merge-retry">Retry sorting saved readings</button>' : ''}`;
}

// Files, bitmaps and image data URLs stay transient. State keeps extracted text only.
async function tilePage(photo) {
  const bitmap = await createImageBitmap(photo.file,{imageOrientation:'from-image'});
  try {
    const turn = photo.rotation % 180 !== 0;
    const width = turn ? bitmap.height : bitmap.width, height = turn ? bitmap.width : bitmap.height;
    const scale = Math.min(1,2400/Math.max(width,height));
    const page = document.createElement('canvas'); page.width = Math.max(1,Math.round(width*scale)); page.height = Math.max(1,Math.round(height*scale));
    const ctx = page.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,page.width,page.height);
    ctx.translate(page.width/2,page.height/2); ctx.rotate(photo.rotation*Math.PI/180);
    ctx.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);
    const cols = page.height >= page.width ? 2 : 3, rows = cols === 2 ? 3 : 2, result = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const cellW = page.width/cols, cellH = page.height/rows;
      // Neighbours share 10% of a cell: 5% beyond each edge at a seam.
      const left = Math.max(0,Math.floor(x*cellW-cellW*.05)), top = Math.max(0,Math.floor(y*cellH-cellH*.05));
      const right = Math.min(page.width,Math.ceil((x+1)*cellW+cellW*.05)), bottom = Math.min(page.height,Math.ceil((y+1)*cellH+cellH*.05));
      const tile = document.createElement('canvas'); tile.width = right-left; tile.height = bottom-top;
      tile.getContext('2d').drawImage(page,left,top,tile.width,tile.height,0,0,tile.width,tile.height);
      const blob = await new Promise((resolve,reject) => tile.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode the photo. Try another image.')),'image/jpeg',.85));
      if (blob.size > 2*1024*1024) throw new Error('This photo is too detailed to read. Try a smaller photo.');
      const dataURL = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read photo.')); reader.readAsDataURL(blob); });
      if (dataURL.length > 2*1024*1024) throw new Error('This photo is too detailed to read. Try a smaller photo.');
      result.push(dataURL);
      tile.width = tile.height = 0;
    }
    page.width = page.height = 0; return result;
  } finally { bitmap.close(); }
}
async function readPage(photo,index,total) {
  const tiles = await tilePage(photo);
  const response = await fetch('/api/read-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:photo.id,tiles})});
  if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.retryAfter ? `Reading limit reached. Try again in ${e.retryAfter} seconds.` : e.error ?? 'Photo reading failed. Try again.'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const page = {id:photo.id,scannedAt:japanToday(),tiles:Array(tiles.length).fill(null)};
  let buffer = '', parts = 0, done = false, failed = 0;
  function line(text) {
    if (!text.trim()) return;
    const event = JSON.parse(text);
    if (event.type === 'tile' || event.type === 'tile-error') {
      if (Number.isInteger(event.index) && event.index >= 0 && event.index < page.tiles.length) page.tiles[event.index] = event.tile ?? null;
      if (event.type === 'tile-error') failed++;
      $('progress').textContent = `Reading page ${index + 1} of ${total} · part ${++parts} of ${tiles.length}`;
    } else if (event.type === 'done' && Array.isArray(event.tiles)) { page.tiles = event.tiles; done = true; }
  }
  try {
    while (true) {
      const chunk = await reader.read(); buffer += decoder.decode(chunk.value,{stream:!chunk.done});
      let end; while ((end = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0,end)); buffer = buffer.slice(end+1); }
      if (chunk.done) break;
    }
    line(buffer);
    if (!done) throw new Error('Reading was interrupted. Your photo is ready to try again.');
    if (page.tiles.every(t => !t)) throw new Error('No parts could be read. Try a clearer photo.');
    state.pages[page.id] = page; save();
    if (failed) notify(`${failed} parts could not be read. Check the printed flyer before using an offer.`);
    return page.id;
  } finally { reader.releaseLock(); }
}
async function mergeGroups(affected = null) {
  const groups = groupPages(Object.values(state.pages),state.overrides);
  const selected = affected ? groups.filter(g => g.pageIds.some(id => affected.has(id))) : groups.filter(g => !state.flyers.some(f => f.pageIds.length === g.pageIds.length && f.pageIds.every(id => g.pageIds.includes(id))));
  // Stage the replacement before removing old flyers, so failed merges are retryable.
  const results = [];
  for (let i = 0; i < selected.length; i++) {
    const group = selected[i]; $('progress').textContent = `Sorting flyer ${i+1} of ${selected.length}…`;
    const old = state.flyers.find(f => f.pageIds.length === group.pageIds.length && f.pageIds.every(id => group.pageIds.includes(id)));
    const result = await api('/api/merge',{flyerId:old?.id ?? group.id,pages:group.pageIds.map(id => ({id,tiles:state.pages[id].tiles.filter(Boolean)})),scanDate:japanToday(),home:home()});
    const stored = storable(result.flyer);
    results.push(stored);
    if (stored.bucket === 'keep') {
      // Discard private readings immediately, even if a later group's merge fails.
      state.flyers = [...state.flyers.filter(f => !f.pageIds.some(id => stored.pageIds.includes(id))),stored];
      save();
    }
  }
  const pageIds = new Set(selected.flatMap(g => g.pageIds));
  const oldFlyers = state.flyers.filter(f => f.pageIds.some(id => pageIds.has(id)));
  state.flyers = [...state.flyers.filter(f => !f.pageIds.some(id => pageIds.has(id))),...results];
  // A page correction can change entry indices. Follow printed text/value, not the old index.
  for (const outing of state.outings) for (const used of [...outing.used]) {
    const old = oldFlyers.find(f => f.id === used.flyerId); if (!old) continue;
    const key = used.kind === 'offer' ? 'offers' : 'items', entry = old[key]?.[used.index];
    const match = results.map(f => ({f,index:(f[key] ?? []).findIndex(e => JSON.stringify({...e,page:null}) === JSON.stringify({...entry,page:null}))})).find(m => m.index >= 0);
    if (match) { used.flyerId = match.f.id; used.index = match.index; }
    else outing.used = outing.used.filter(u => u !== used);
  }
  save(); chosenStops = null; groceryChoice = null; await rank(); $('progress').textContent = '';
}
async function readPhotos() {
  if (!home()) { setupOpen = true; renderSetup(); render(); notify('Choose your home station before reading.'); return; }
  if (!photos.length || busy) return;
  busy = true; notify(); render();
  const batch = [...photos], success = new Set(), failures = []; let next = 0;
  try {
    await Promise.all(Array.from({length:Math.min(2,batch.length)},async () => {
      while (next < batch.length) { const index = next++; try { success.add(await readPage(batch[index],index,batch.length)); } catch (e) { failures.push(e.message); } }
    }));
    for (const p of photos.filter(p => success.has(p.id))) URL.revokeObjectURL(p.url);
    photos = photos.filter(p => !success.has(p.id));
    if (success.size) await mergeGroups();
    if (failures.length) notify(failures.join(' '));
    $('progress').textContent = success.size ? '' : 'No pages read. Try again.';
  } finally { busy = false; render(); focusHeading(); }
}
function arrivalStatus(f,minutes) {
  // Lessons and events print class times, not opening hours, so they never rule a stop out.
  if (['lesson','event'].includes(f.category)) return 'unknown';
  const date = new Date(Date.now()+minutes*60000);
  const time = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).split(':');
  return openStatus({hours:f.hours ?? f.location?.place?.hours},japanToday(date),Number(time[0])*60+Number(time[1]));
}
function candidates() {
  const h = home(); if (!h) return [];
  return sortedWalks().filter(f => f.location && !expired(f) && state.labels[f.id] !== 0 && arrivalStatus(f,walkMinutes(distanceMeters(h,f.location))) !== 'closed');
}
function plan() {
  const h = home(); if (!h) return null;
  const selected = candidates().filter(f => chosenStops === null || chosenStops.has(f.id)).map(f => ({...f.location,id:f.id,name:f.business?.name ?? 'Flyer stop'}));
  if (groceryChoice) { const g = stop(groceryChoice); if (g) selected.push(g); }
  const starts = [h,...neighbours(stations,stationsOnLine,h.stationId,1).map(n => coordinates.find(s => s.id === n.station.id)).filter(Boolean).map(s => ({stationId:s.id,lat:s.lat,lon:s.lon}))];
  const plans = starts.map(start => {
    let kept = [...selected], result;
    for (let i = 0; i <= selected.length; i++) {
      result = planOuting({start,end:h,stops:kept,maxMinutes:state.settings.maxMinutes});
      let previous = start, minutes = 0; const closed = new Set();
      for (const p of result.stops) { minutes += walkMinutes(distanceMeters(previous,p)); const f = flyer(p.id); if (f && arrivalStatus(f,minutes) === 'closed') closed.add(p.id); previous = p; }
      if (!closed.size) break; kept = kept.filter(p => !closed.has(p.id));
    }
    return result;
  });
  return plans.sort((a,b) => b.stops.length-a.stops.length || a.meters-b.meters)[0];
}
function totals(o) {
  const e = estimates(o.meters,state.settings.weightKg);
  return `${(e.routeMeters/1000).toFixed(1)} km · ~${e.minutes} min · ~${e.steps.toLocaleString('en-US')} steps · ~${e.kcal} kcal (estimates)`;
}
function shortDate(value) { return formatDate(value).replace(/ \d{4}$/, ''); }
function stopReason(f,o = null) {
  if (!f) return '';
  const selected = (f.items ?? []).filter((_,index) => shoppingList.has(f.id+':'+index) || o?.used?.some(u => u.flyerId === f.id && u.kind === 'item' && u.index === index));
  let text = '';
  if (f.category === 'supermarket' && selected.length) text = selected.map(i => `${i.name_en ?? i.name_ja ?? 'Item'} ${money(i.price_yen)}`).join(' · ');
  else {
    const best = [...(f.offers ?? [])].sort((a,b) => (printedValue(b) ?? -1)-(printedValue(a) ?? -1))[0];
    if (best) { const value = printedValue(best); text = `${best.text_en ?? 'Printed offer'}${value !== null ? ` · worth ${money(value)} as printed` : ''}`; }
    else if (f.deadline) text = `until ${shortDate(f.deadline)}`;
  }
  return text ? `<p class="cw-stop-reason cw-muted">${escape(text)}</p>` : '';
}
function routeList(o,points) {
  let previous = o.start;
  const rows = points.map(p => { const minutes = walkMinutes(distanceMeters(previous,p)); previous = p; return `<li><p class="cw-meta">${minutes} min walking</p><strong lang="ja">${escape(p.name)}</strong>${stopReason(flyer(p.id),o)}</li>`; });
  rows.push(`<li><p class="cw-meta">${walkMinutes(distanceMeters(previous,o.end))} min walking</p><strong>Home · ${escape(stationName(o.end))}</strong></li>`);
  return `<ol class="cw-route"><li><strong>${escape(stationName(o.start))} station</strong></li>${rows.join('')}</ol>`;
}
function mapRoute(o,points) {
  return `<a class="cw-link" href="${escape(mapsLink(o.start,points,o.end))}" target="_blank" rel="noopener noreferrer">Open walking route</a>${points.length > 3 ? '<p class="cw-muted">route covers the first 3 stops</p>' : ''}`;
}
function groceryNote(s) {
  const programs = storePrograms(s,japanToday()).map(id => walletOptions.find(p => p.id === id)?.name ?? id);
  if (s.chain === 'mybasket' && programs.includes('WAON POINT')) return `${reward(s.chain,japanToday())}× WAON POINT today · next bonus ${formatDate(nextBonus(japanToday()).date)}. Eligible payment and item conditions apply.`;
  return programs.length ? `${programs.join(' / ')} · check payment and item conditions in Shops.` : 'Point support unknown. Check the branch before relying on rewards.';
}
function renderWalk() {
  const active = state.outings.find(o => o.status === 'active');
  if (active) return `<h1>Your walk is underway.</h1><p class="cw-muted">${escape(stationName(active.start))} → ${escape(stationName(active.end))}</p>${activeWalk(active)}<button class="cw-primary" data-action="finish" data-id="${escape(active.id)}">Finish walk</button>`;
  if (!home()) return '<h1>Make room for a walk.</h1><p>Set your home station to plan a route.</p><button data-action="settings">Set up your walk</button>';
  const list = candidates(), p = plan();
  const suggested = p?.stops.length ? groceryOnTheWay([p.start,...p.stops,p.end],stores)[0]?.store : null;
  return `<h1>A little walk home.</h1><p class="cw-muted">Finish at ${escape(stationName(home()))} · up to ${state.settings.maxMinutes} min</p><h2>Choose your stops</h2>${list.length ? list.map(f => `<label class="cw-check"><input type="checkbox" data-stop="${escape(f.id)}" ${chosenStops === null || chosenStops.has(f.id) ? 'checked' : ''}><span lang="ja">${escape(f.business?.name)}</span></label>`).join('') : '<p class="cw-muted">Read a flyer with a location to find a stop. Expired, closed and 👎 places are left out.</p>'}${suggested ? `<div class="cw-entry"><h3>Groceries on the way</h3><p>${escape(suggested.name)}</p><p class="cw-muted">${escape(groceryNote(suggested))}</p><label class="cw-check"><input type="checkbox" data-grocery="${escape('store:'+suggested.branchId)}" ${groceryChoice ? 'checked' : ''}>Include grocery stop</label></div>` : ''}<button data-action="plan" class="cw-primary" ${!list.length ? 'disabled' : ''}>Plan walk</button>${p?.stops.length ? planCard(p) : list.length ? '<p class="cw-muted">No selected stops fit this walk length. Change your stops or choose a longer walk in Settings.</p>' : ''}`;
}
function planCard(p) {
  return `<div class="cw-plan"><h2>${p.start.stationId !== state.settings.home ? `Get off one stop early at ${escape(stationName(p.start))}` : 'Walk from your home station'}</h2>${routeList(p,p.stops)}<p class="cw-meta">${totals(p)}</p>${p.dropped.length ? `<p class="cw-muted">${p.dropped.length} ${plural(p.dropped.length,'stop','stops')} left out to fit your time.</p>` : ''}${mapRoute(p,p.stops)}<div class="cw-actions"><button class="cw-primary" data-action="start">Start walk</button></div></div>`;
}
const usedEntries = (outings = state.outings) => outings.flatMap(o => o.used.map(u => ({entry:flyer(u.flyerId)?.[u.kind === 'offer' ? 'offers' : 'items']?.[u.index]})));
function icon(category) {
  const path = ['supermarket','drugstore','shop'].includes(category) ? '<path d="m3 8 2-5h14l2 5M4 9v12h16V9M9 21v-7h6v7M3 8c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0"/>' : ['restaurant','food_delivery'].includes(category) ? '<path d="M5 3v6m3-6v6M3 3v6a3 3 0 0 0 6 0M6 12v9M18 3v18m0-18c-4 2-4 9 0 9"/>' : ['clinic','cleaning'].includes(category) ? '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>' : ['lesson','fitness'].includes(category) ? '<circle cx="14" cy="4" r="2"/><path d="m6 21 5-7 1-6 5 5h4M3 12l5-4h4m-1 6 5 7"/>' : '<path d="m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}
function stampCard(stamp) {
  const p = stop(stamp.stopId);
  // Stop and time identify each stamp without changing the storage contract.
  const id = stamp.stopId + ':' + stamp.at;
  const angle = [...id].reduce((hash,c) => (hash * 31 + c.charCodeAt(0)) >>> 0,0) % 17 - 8;
  return `<div class="cw-stamp-card" data-stamp="${escape(stamp.stopId)}"><span class="cw-stamp ${stamp.kind === 'gps' ? 'gps' : 'self'}" style="--stamp-angle:${angle}deg" aria-label="${stamp.kind === 'gps' ? 'GPS verified solid stamp' : 'Self-reported outline stamp'}">${icon(p?.category)}<span class="cw-stamp-name" lang="ja">${escape(p?.name ?? 'Stamped place')}</span></span><p class="cw-meta">${formatDate(stamp.at)}</p><p class="cw-meta">${stamp.kind === 'gps' ? 'GPS verified' : 'self-reported'}</p></div>`;
}
function activeWalk(o) {
  const amount = savings(usedEntries([o])), points = o.stopIds.map(stop).filter(Boolean);
  return `<p class="cw-meta">${totals(o)}</p>${mapRoute(o,points)}<p id="walk-saved" class="cw-value" aria-live="polite">Saved ${money(amount.yen)} · printed on the flyer</p>${o.stopIds.map(id => {
    const p = stop(id), stamped = o.stamps.find(s => s.stopId === id), message = stampMessages.get(id);
    return `<div class="cw-stop" data-active-stop="${escape(id)}"><h2 lang="ja">${escape(p?.name ?? 'Flyer stop')}</h2>${stopReason(p?.flyer,o)}${stamped ? stampCard(stamped) + (p?.flyer ? entryList(p.flyer,o) : '') : `<div class="cw-actions"><button data-action="here" data-id="${escape(id)}" data-outing="${escape(o.id)}">I'm here</button></div>${message ? `<p class="cw-muted">${escape(message.text)}</p><button data-action="stamp-anyway" data-id="${escape(id)}" data-outing="${escape(o.id)}">Stamp anyway</button>` : ''}`}</div>`;
  }).join('')}`;
}
function stamp(o,id,kind,distance = null) {
  if (o.status !== 'active' || o.stamps.some(s => s.stopId === id)) return;
  o.stamps.push({stopId:id,at:now(),kind,distance}); stampMessages.delete(id); save(); render();
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
// ISO-week keys use their Monday date, including weeks across a year boundary.
function isoMonday(date) {
  const d = new Date(japanToday(new Date(date))+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10);
}
function streak() {
  const weeks = new Set(state.outings.filter(o => o.status === 'done').map(o => isoMonday(o.stamps.at(-1)?.at ?? o.createdAt)));
  let monday = isoMonday(now()), count = 0;
  const previous = value => { const d = new Date(value+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-7); return d.toISOString().slice(0,10); };
  if (!weeks.has(monday)) monday = previous(monday);
  while (weeks.has(monday)) { count++; monday = previous(monday); }
  return count;
}
function renderStamps() {
  const active = state.outings.find(o => o.status === 'active'), weeks = streak();
  const done = state.outings.filter(o => o.status === 'done'), allStamps = state.outings.flatMap(o => o.stamps);
  const distance = done.reduce((sum,o) => sum+o.meters,0), e = estimates(distance,state.settings.weightKg), amount = savings(usedEntries());
  const stats = [[done.length,'walks done'],[allStamps.length,'places stamped'],[(e.routeMeters/1000).toFixed(1),'km'],[e.steps.toLocaleString('en-US'),'steps'],[e.kcal,'kcal'],[money(amount.yen),'yen saved']];
  return `<h1>Every stop adds up.</h1>${active ? `<div class="cw-scan"><h2>Walk in progress · ${active.stamps.length} of ${active.stopIds.length} ${plural(active.stopIds.length,'stop','stops')} stamped</h2><button class="cw-primary" data-action="continue-walk">Continue walk</button></div>` : ''}<div class="cw-stats">${stats.map(([n,label]) => `<div class="cw-stat" data-metric="${label}"><strong>${n}</strong><span>${label === 'walks done' ? plural(done.length,'walk done','walks done') : label}</span></div>`).join('')}</div><p class="cw-muted">Distance, steps and kcal are estimates from planned routes for completed walks.</p>${amount.uncounted ? `<p class="cw-meta">+ ${amount.uncounted} used without a printed value</p>` : ''}<p class="cw-meta">${weeks ? `${weeks} ${plural(weeks,'week','weeks')} in your weekly streak` : 'Finish a walk this week to start a streak'}</p><h2>Your stamps</h2>${allStamps.length ? `<div class="cw-stamp-grid">${allStamps.map(stampCard).join('')}</div>` : '<p class="cw-muted">Start a walk and check in at your first stop.</p>'}`;
}
function newestFlyers() {
  // Appending scan batches preserves order even for private markers, which have no date field.
  return [...state.flyers].reverse();
}
function renderHistory() {
  if (historyDetail) {
    const f = flyer(historyDetail), o = state.outings.find(x => x.id === historyDetail);
    return `<button data-action="history-back">← History</button>${f ? flyerCard(f) : o ? `<h1>Walk · ${formatDate(o.createdAt)}</h1><p class="cw-meta">${escape(o.status)} · ${totals(o)}</p>${routeList(o,o.stopIds.map(stop).filter(Boolean))}${mapRoute(o,o.stopIds.map(stop).filter(Boolean))}<div class="cw-stamp-grid">${o.stamps.map(stampCard).join('')}</div><p class="cw-value">Saved ${money(savings(usedEntries([o])).yen)} · printed on the flyer</p>` : ''}`;
  }
  const query = historyQuery.toLowerCase();
  const list = newestFlyers().filter(f => [f.business?.name,f.business?.kind,f.summary_en].join(' ').toLowerCase().includes(query));
  return `<h1>Your saved pages &amp; walks.</h1><label class="cw-field">Search flyers<input id="history-search" type="search" value="${escape(historyQuery)}" placeholder="Business name, kind or summary"></label><div id="history-results"><h2>${plural(list.length,'Flyer','Flyers')} · ${list.length}</h2>${list.map(f => `<button class="cw-history-item" data-action="history-detail" data-id="${escape(f.id)}"><strong lang="ja">${escape(f.business?.name ?? 'Personal or official mail')}</strong><span class="cw-meta"><span class="cw-pill cw-pill-${f.bucket}">${titles[f.bucket]}</span> · ${f.pageIds.length} ${plural(f.pageIds.length,'page','pages')}${f.deadline ? ` · until ${shortDate(f.deadline)}` : ''}${expired(f) ? ' · expired' : ''}</span><span class="cw-muted">${escape(f.summary_en)}</span></button>`).join('') || '<p class="cw-muted">No saved flyers match.</p>'}<h2 style="margin-top:28px">${plural(state.outings.length,'Walk','Walks')} · ${state.outings.length}</h2>${[...state.outings].reverse().map(o => `<button class="cw-history-item" data-action="history-detail" data-id="${escape(o.id)}"><strong>${formatDate(o.createdAt)} · ${escape(o.status)}</strong><span class="cw-meta">${o.stopIds.length} ${plural(o.stopIds.length,'stop','stops')} · ${(estimates(o.meters).routeMeters/1000).toFixed(1)} km · ${o.stamps.length} ${plural(o.stamps.length,'stamp','stamps')}</span></button>`).join('') || '<p class="cw-muted">Your first walk will appear here.</p>'}</div>`;
}
function render() {
  const focused = document.activeElement;
  const focusKey = focused?.dataset.action === 'rate' ? {id:focused.dataset.id,label:focused.dataset.label} : null;
  const tossOpen = $('panel').querySelector('[data-bucket=toss]')?.open;
  // Async results (ranking, merges) re-render the panel; keep focus on its heading instead of dropping it to <body>.
  const headingFocused = $('panel').contains(document.activeElement) && /^H[1-3]$/.test(document.activeElement.tagName);
  $('panel').hidden = setupOpen; $('panel').setAttribute('aria-label',tab[0].toUpperCase()+tab.slice(1));
  $('panel').innerHTML = tab === 'mailbox' ? renderMailbox() : tab === 'walk' ? renderWalk() : tab === 'stamps' ? renderStamps() : renderHistory();
  if (tossOpen) { const toss = $('panel').querySelector('[data-bucket=toss]'); if (toss) toss.open = true; }
  if (focusKey) [...$('panel').querySelectorAll('[data-action=rate]')].find(b => b.dataset.id === focusKey.id && b.dataset.label === focusKey.label)?.focus({preventScroll:true});
  for (const b of document.querySelectorAll('[data-tab]')) { if (b.dataset.tab === tab) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); }
  if (headingFocused) focusHeading();
}
function focusHeading() {
  const heading = (setupOpen ? $('setup') : $('panel')).querySelector('h1, h2, h3');
  if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
}
function changeTab(value) { tab = value; historyDetail = null; render(); focusHeading(); window.scrollTo({top:0,behavior:'instant'}); }
function newOuting(p,status) {
  state.outings = state.outings.filter(o => o.status !== 'planned');
  state.outings.push({id:uid('o-'),createdAt:now(),start:p.start,end:p.end,stopIds:p.stops.map(s => s.id),meters:p.meters,minutes:p.minutes,status,stamps:[],used:[]}); save(); render();
}
async function action(button) {
  const id = button.dataset.id;
  switch (button.dataset.action) {
    case 'settings': setupOpen = true; renderSetup(); render(); break;
    case 'close-setup': setupOpen = false; renderSetup(); render(); break;
    case 'take-photo': $('camera-input').click(); break;
    case 'choose-photos': $('photos-input').click(); break;
    case 'rotate': if (!busy) { const p = photos.find(p => p.id === id); p.rotation = (p.rotation+90)%360; render(); } break;
    case 'remove-photo': if (!busy) { const p = photos.find(p => p.id === id); URL.revokeObjectURL(p.url); photos = photos.filter(p => p.id !== id); render(); } break;
    case 'read': await readPhotos(); break;
    case 'continue-walk': changeTab('walk'); break;
    case 'rate': if (flyer(id)?.bucket === 'keep') break; state.labels[id] = Number(button.dataset.label); save(); render(); await rank(); break;
    case 'merge-retry': if (!busy) { busy = true; render(); try { await mergeGroups(); } finally { busy = false; render(); } } break;
    case 'plan': { const p = plan(); if (p?.stops.length) { newOuting(p,'planned'); notify('Walk planned. Start when you are ready.'); } break; }
    case 'start': { if (state.outings.some(o => o.status === 'active')) break; const p = plan(); if (p?.stops.length) { newOuting(p,'active'); notify(); } break; }
    case 'here': { const o = state.outings.find(o => o.id === button.dataset.outing); if (o?.status === 'active') await here(o,id,button); break; }
    case 'stamp-anyway': { const o = state.outings.find(o => o.id === button.dataset.outing); if (o) stamp(o,id,'self',stampMessages.get(id)?.distance ?? null); break; }
    case 'finish': { const o = state.outings.find(o => o.id === id); if (o) { o.status = 'done'; save(); notify('Walk finished. Your stamps are saved.'); changeTab('stamps'); } break; }
    case 'history-detail': historyDetail = id; render(); focusHeading(); break;
    case 'history-back': historyDetail = null; render(); focusHeading(); break;
  }
}
function safely(task) { Promise.resolve().then(task).catch(error => { notify(error.message ?? 'Something went wrong. Try again.'); $('progress').textContent = 'Stopped. Your saved readings are available to retry.'; }); }
document.addEventListener('click',event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.tab) { changeTab(button.dataset.tab); return; }
  if (button.dataset.action) safely(() => action(button));
});
$('settings-button').addEventListener('click',() => { setupOpen = !setupOpen || !state.settings.home; renderSetup(); render(); if (setupOpen) $('setup-line').focus(); });
document.addEventListener('change',event => {
  const input = event.target;
  if (input.id === 'photos-input' || input.id === 'camera-input') {
    for (const file of input.files) if (file.type.startsWith('image/')) photos.push({id:uid('p-'),file,url:URL.createObjectURL(file),rotation:0});
    input.value = ''; render();
  } else if (input.dataset.stop) {
    if (chosenStops === null) chosenStops = new Set(candidates().map(f => f.id));
    if (input.checked) chosenStops.add(input.dataset.stop); else chosenStops.delete(input.dataset.stop); render();
  } else if (input.dataset.grocery) { groceryChoice = input.checked ? input.dataset.grocery : null; render(); }
  else if (input.dataset.shopping) { const key = input.dataset.shopping+':'+input.dataset.index; if (input.checked) shoppingList.add(key); else shoppingList.delete(key); }
  else if (input.dataset.used) {
    const o = state.outings.find(o => o.id === input.dataset.outing); if (!o || o.status !== 'active') return;
    const u = {flyerId:input.dataset.used,kind:input.dataset.kind,index:Number(input.dataset.index)};
    o.used = o.used.filter(v => !(v.flyerId === u.flyerId && v.kind === u.kind && v.index === u.index)); if (input.checked) o.used.push(u); save();
    $('walk-saved').textContent = `Saved ${money(savings(usedEntries([o])).yen)} · printed on the flyer`;
  }
});
document.addEventListener('input',event => {
  if (event.target.id !== 'history-search') return;
  historyQuery = event.target.value;
  // Replace only results, preserving the search input's focus and caret.
  const template = document.createElement('template'); template.innerHTML = renderHistory();
  $('history-results').replaceWith(template.content.querySelector('#history-results'));
});
document.addEventListener('submit',event => {
  const form = event.target;
  if (form.dataset.locate) {
    event.preventDefault(); safely(async () => {
      const f = flyer(form.dataset.locate), data = new FormData(form), h = home();
      const query = new URLSearchParams({q:data.get('address'),name:f.business?.name ?? ''});
      for (const phone of f.phones ?? []) query.append('phone',phone);
      if (h) { query.set('lat',h.lat); query.set('lon',h.lon); }
      const b = form.querySelector('button'); b.disabled = true;
      try { const result = await api('/api/locate?'+query); if (result.location) { f.location = result.location; f.needsLookup = false; save(); render(); await rank(); } else notify('No location found. Try the printed address or the full business name.'); }
      finally { b.disabled = false; }
    });
  } else if (form.dataset.fix) {
    event.preventDefault(); if (busy) return;
    safely(async () => {
      const f = flyer(form.dataset.fix), changes = [...new FormData(form)].filter(([,value]) => value !== 'keep');
      if (!changes.length) return;
      const affected = new Set(f.pageIds);
      for (const [,value] of changes) { const target = flyer(value); if (target) target.pageIds.forEach(id => affected.add(id)); }
      for (const other of state.flyers) if (other.pageIds.some(id => affected.has(id))) for (const id of other.pageIds) if (state.pages[id]) state.overrides[id] = other.id;
      for (const [id,value] of changes) state.overrides[id] = value === 'split' ? uid('split-') : value;
      save(); busy = true; render();
      try { await mergeGroups(affected); $('progress').textContent = ''; } finally { busy = false; render(); }
    });
  }
});
window.addEventListener('pagehide',() => { for (const p of photos) URL.revokeObjectURL(p.url); });
renderSetup(); render();
try {
  const response = await fetch('/station-coordinates.json'); if (!response.ok) throw new Error();
  coordinates = await response.json(); render();
} catch { notify('Station coordinates could not be loaded. Reload to set up or plan a walk.'); }
try { const config = await api('/api/config'); $('mode').textContent = config.mode === 'cloud' ? 'Gemma 4 · cloud' : config.mode === 'local' ? 'Local Gemma — check every price' : 'Demo mode'; }
catch { $('mode').textContent = 'Reading service unavailable · try reloading'; }
save(); await rank();
