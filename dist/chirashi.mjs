import {stations, railLines, stationsOnLine, stores, walletOptions} from '/catalog.mjs';
import {groupPages, storable, printedValue, savings, featureRow, parseDeadline} from '/mailbox.mjs';
import {distanceMeters, neighbours, nearestStation, orderStops, planOuting, walkMinutes, estimates, mapsLink, groceryOnTheWay, openStatus} from '/walks.mjs';
import {japanToday, storePrograms, reward, nextBonus} from '/rules.mjs';

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
    base.shoppingList = Array.isArray(s.shoppingList) ? s.shoppingList.filter(key => typeof key === 'string') : [];
    for (const f of base.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete base.pages[id]; delete base.overrides[id]; }
    return base;
  } catch { return fresh(); }
}
let state = load(), coordinates = [], tab = 'mailbox', photos = [], busy = false, setupOpen = !state.settings.home;
let scores = new Map(), rankModel = '', rankSequence = 0;
let chosenStops = null, groceryChoice = null, shoppingList = new Set(state.shoppingList ?? []), historyQuery = '', historyDetail = null;
let reading = null, preparing = 0, recovering = true, recovered = false, photoStorage = true, wakeLock = null;
let photoWork = Promise.resolve();
const stampMessages = new Map();
function notify(message = '') { $('notice').textContent = message; }
function save() {
  state.shoppingList = [...shoppingList];
  state.flyers = state.flyers.map(storable);
  for (const f of state.flyers) if (f.bucket === 'keep') for (const id of f.pageIds) { delete state.pages[id]; delete state.overrides[id]; }
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
function mailboxStat() {
  const count = bucket => state.flyers.filter(f => f.bucket === bucket).length;
  return `${state.flyers.length} ${plural(state.flyers.length,'flyer','flyers')} sorted → ${count('walk')} ${plural(count('walk'),'outing','outings')}, ${count('home')} ${plural(count('home'),'deal','deals')}, ${count('toss')} safe to throw away`;
}
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
function personalNote() {
  const n = state.flyers.filter(f => f.bucket !== 'keep' && Object.hasOwn(state.labels,f.id)).length;
  return rankModel ? `based on your ${n} ${plural(n,'choice','choices')} (${rankModel === 'tabpfn' ? 'TabPFN' : 'simple rules'})` : n < 6 ? 'Rate 6 flyers to personalise' : 'Choose both 👍 and 👎 to personalise';
}
function renderSetup() {
  $('setup').hidden = !setupOpen;
  if (!setupOpen) return;
  $('setup').innerHTML = `<div class="cw-setup"><h1 id="setup-heading">Your walk starts here.</h1><p class="cw-muted">Choose the station you want to walk home to.</p><form id="setup-form"><label class="cw-field">Train line<select id="setup-line" required><option value="">Choose a line</option>${railLines.map(l => `<option lang="ja" value="${escape(l.id)}">${escape(l.name)} · ${escape(l.ja)}</option>`).join('')}</select></label><label class="cw-field">Home station<select id="setup-station" required><option value="">Choose a station</option></select></label><fieldset><legend>Walk length</legend><div class="cw-radio">${[20,40,60,90].map(n => `<label class="cw-check"><input type="radio" name="minutes" value="${n}" ${state.settings.maxMinutes === n ? 'checked' : ''}>${n} min</label>`).join('')}</div></fieldset><label class="cw-field">Weight in kg<input id="setup-weight" type="number" min="1" max="500" step="0.1" value="${escape(state.settings.weightKg)}" required></label><p class="cw-muted">Used only for the kcal estimate.</p><div class="cw-actions"><button class="cw-primary" type="submit" ${busy ? 'disabled' : ''}>Save</button>${state.settings.home ? '<button type="button" data-action="close-setup">Cancel</button>' : ''}</div></form></div>`;
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
  return `${reading ? readingCard() : ''}<h1>Your mailbox, sorted.</h1><p class="cw-muted">Read the flyers. Keep the useful ones. Find a reason to walk.</p>${recovered && photos.length && !reading ? resumeCard() : ''}${!reading ? addPagesCard() : ''}<p id="mailbox-stat" class="cw-meta">${mailboxStat()}</p><p id="personal-note" class="cw-meta">${personalNote()}</p>${Object.keys(titles).map(bucket).join('')}${pendingGroups() ? `<button data-action="merge-retry" ${busy ? 'disabled' : ''}>Retry sorting saved readings</button>` : ''}`;
}
function addPagesCard() {
  const disabled = busy || preparing || recovering;
  const rotateIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/></svg>';
  const removeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  return `<div class="cw-scan"><h2>Add today's pages</h2><div class="cw-actions"><button type="button" data-action="take-photo" ${disabled ? 'disabled' : ''}>Take photo</button><button type="button" data-action="choose-photos" ${disabled ? 'disabled' : ''}>Choose photos</button></div><input id="camera-input" type="file" accept="image/*" capture="environment" hidden><input id="photos-input" type="file" accept="image/*" multiple hidden><div class="cw-photos">${photos.map((p,i) => `<div class="cw-photo" data-rotation="${p.rotation}"><div class="cw-photo-preview"><img src="${escape(p.url)}" alt="Page ${i + 1} preview"><button data-action="rotate" data-id="${escape(p.id)}" aria-label="Rotate page ${i + 1}" ${disabled ? 'disabled' : ''}>${rotateIcon}</button><button data-action="remove-photo" data-id="${escape(p.id)}" aria-label="Remove page ${i + 1}" ${disabled ? 'disabled' : ''}>${removeIcon}</button></div><p class="cw-meta">Page ${i+1}</p></div>`).join('')}</div>${preparing ? '<p class="cw-muted">Preparing cropped previews…</p>' : ''}${photos.length ? `<div class="cw-read-dock"><button class="cw-primary" data-action="read" ${disabled ? 'disabled' : ''}>Read ${photos.length} ${plural(photos.length,'page','pages')}</button></div>` : '<p class="cw-muted">Each photo is one page. Rotate it before reading.</p>'}${!photoStorage ? '<p class="cw-muted">Keep this screen open until reading finishes.</p>' : ''}</div>`;
}
function resumeCard() {
  const time = new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(photos[0].addedAt));
  return `<div class="cw-resume"><h2>${photos.length} ${plural(photos.length,'page','pages')} waiting from ${escape(time)}</h2><p class="cw-muted">${photos.map((_,i) => `Page ${i+1}`).join(' · ')}. Your photos are still on this phone.</p><div class="cw-actions"><button class="cw-primary" data-action="resume">Resume reading</button><button data-action="discard">Discard</button></div></div>`;
}
function pageStatus(p) {
  return p.status === 'read' ? 'Read ✓' : p.status === 'failed' ? 'Failed' : p.status === 'reading' ? `Reading part ${Math.min(6,p.parts.size+1)} of 6` : 'Waiting';
}
function readingCard() {
  const r = reading;
  return `<section id="reading-card" class="cw-reading" aria-labelledby="reading-heading"><h2 id="reading-heading" tabindex="-1">Reading your mailbox</h2><div class="cw-reading-activity" ${!r.active ? 'hidden' : ''}><span class="cw-activity" aria-hidden="true"></span><span>Gemma is reading your pages…</span></div><label for="reading-progress" id="reading-count"></label><progress id="reading-progress" max="${r.batch.length*6}" value="0"></progress><p id="reading-time" class="cw-meta"></p><p id="reading-message">${escape(r.message)}</p><p class="cw-muted">Keep this screen open. Photos stay on this phone until they're read.</p><button data-action="stop-reading" ${!r.active ? 'hidden' : ''}>Stop reading</button><ul class="cw-reading-pages">${r.batch.map((p,i) => `<li data-reading-page="${escape(p.id)}"><img src="${escape(p.url)}" alt="Page ${i+1} preview"><div><strong>Page ${i+1}</strong><span data-page-status>${pageStatus(p)}</span><span class="cw-meta" data-page-error>${escape(p.error)}</span></div><button data-action="retry-page" data-id="${escape(p.id)}" aria-label="Retry page ${i+1}" ${p.status !== 'failed' ? 'hidden' : ''}>Retry</button></li>`).join('')}</ul>${!photoStorage ? '<p class="cw-muted">Keep this screen open until reading finishes.</p>' : ''}${!r.active && photos.length ? '<button data-action="resume">Resume reading</button>' : ''}</section>`;
}
function updateReading() {
  if (!reading || !$('reading-progress')) return;
  const r = reading, count = r.batch.reduce((n,p) => n+p.parts.size,0), total = r.batch.length*6;
  $('reading-progress').value = count;
  $('reading-count').textContent = `${count} of ${total} parts read`;
  const seconds = Math.floor((performance.now()-r.started)/1000);
  const elapsed = seconds < 60 ? `${seconds} s elapsed` : `${Math.floor(seconds/60)} min ${seconds%60} s elapsed`;
  const average = r.durations.reduce((n,d) => n+d,0) / r.durations.length;
  const lanes = Math.min(3,r.batch.filter(p => ['waiting','reading'].includes(p.status)).length) || 1;
  const remaining = Math.max(1,Math.ceil(average*(total-count)/lanes/60000));
  $('reading-time').textContent = `${elapsed} · ${!r.active ? 'Reading paused' : !count ? 'Gemma is reading the first parts… usually 15–20 s' : count === total ? 'Sorting your flyers…' : `about ${remaining} min left`}`;
  $('reading-message').textContent = r.message;
  for (const row of $('reading-card').querySelectorAll('[data-reading-page]')) {
    const p = r.batch.find(p => p.id === row.dataset.readingPage);
    row.querySelector('[data-page-status]').textContent = pageStatus(p);
    row.querySelector('[data-page-error]').textContent = p.error ?? '';
    row.querySelector('button').hidden = p.status !== 'failed';
  }
}

// Only prepared JPEG Blobs live in IndexedDB. localStorage contains extracted text only.
async function photoDB(method,value) {
  let db;
  try {
    if (!photoStorage) return method === 'getAll' ? [] : false;
    db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('worth-the-walk-photos',1);
      let expired=false;
      const fail = error => { expired=true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => fail(new Error('Photo storage unavailable')),3000);
      request.onupgradeneeded = () => { try { if (!request.result.objectStoreNames.contains('pages')) request.result.createObjectStore('pages',{keyPath:'pageId'}); } catch (error) { fail(error); } };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Photo storage blocked'));
      request.onsuccess = () => {
        try { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result); }
        catch (error) { fail(error); }
      };
    });
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction('pages',method === 'getAll' ? 'readonly' : 'readwrite');
      const request = transaction.objectStore('pages')[method](...(value === undefined ? [] : [value]));
      transaction.oncomplete = () => resolve(method === 'getAll' ? request.result : true);
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
    const pending = await photoDB('getAll');
    for (const p of pending.filter(p => record(p) && typeof p.pageId === 'string' && typeof p.addedAt === 'string').sort((a,b) => a.addedAt.localeCompare(b.addedAt))) {
      if (state.pages[p.pageId] || state.flyers.some(f => f.pageIds.includes(p.pageId))) { await photoDB('delete',p.pageId); continue; }
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
    const cropW=(box.right-box.left)*width,cropH=(box.bottom-box.top)*height,scale=Math.min(1,2400/Math.max(cropW,cropH));
    const page=document.createElement('canvas'); page.width=Math.max(1,Math.round(cropW*scale)); page.height=Math.max(1,Math.round(cropH*scale));
    draw(page.getContext('2d'),scale,box.left*width,box.top*height);
    const blob=await jpeg(page);
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
      const dataURL = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read photo.')); reader.readAsDataURL(blob); });
      if (dataURL.length > 2*1024*1024) throw new Error('This photo is too detailed to read. Try a smaller photo.');
      result.push(dataURL); tile.width = tile.height = 0;
    }
    return result;
  } finally { bitmap.close(); page.width=page.height=0; }
}
async function readPage(photo,session) {
  photo.status='reading'; photo.parts.clear(); photo.error=''; updateReading();
  await storePhoto(photo);
  const tiles = await tilePage(photo);
  session.controller.signal.throwIfAborted();
  let lastPart=performance.now();
  const response = await fetch('/api/read-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:photo.id,tiles}),signal:session.controller.signal});
  if (!response.ok) { const e = await response.json().catch(() => ({})); throw requestError(response,e); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const page = {id:photo.id,scannedAt:japanToday(),tiles:Array(tiles.length).fill(null)};
  let buffer = '', done = false, failed = 0;
  function line(text) {
    if (!text.trim()) return;
    const event = JSON.parse(text);
    if (event.type === 'tile' || event.type === 'tile-error') {
      if (Number.isInteger(event.index) && event.index >= 0 && event.index < tiles.length && !photo.parts.has(event.index)) {
        page.tiles[event.index] = event.tile ?? null; photo.parts.add(event.index);
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
    state.pages[page.id] = page;
    const saved=save();
    photo.status='read'; photo.parts=new Set(tiles.map((_,i) => i));
    // Never remove the recovery copy until extracted text was saved successfully.
    if (saved) await photoDB('delete',photo.id);
    photo.file=null; photo.blob=null;
    photos=photos.filter(p => p.id !== photo.id);
    $('progress').textContent = `Read page ${session.batch.indexOf(photo)+1}. ${session.batch.filter(p => p.status === 'read').length} of ${session.batch.length} pages read.`;
    if (failed) notify(`${failed} parts could not be read. Check the printed flyer before using an offer.`);
    updateReading(); return page.id;
  } finally { reader.releaseLock(); }
}
async function mergeGroups(affected = null,signal) {
  const groups = groupPages(Object.values(state.pages),state.overrides);
  const selected = affected ? groups.filter(g => g.pageIds.some(id => affected.has(id))) : groups.filter(g => !state.flyers.some(f => f.pageIds.length === g.pageIds.length && f.pageIds.every(id => g.pageIds.includes(id))));
  const staged=[];
  const originalFlyers=[...state.flyers];
  for (let i = 0; i < selected.length; i++) {
    signal?.throwIfAborted();
    const group = selected[i];
    if (!reading?.active) $('progress').textContent = `Sorting flyer ${i+1} of ${selected.length}…`;
    const oldFlyers = state.flyers.filter(f => f.pageIds.some(id => group.pageIds.includes(id)));
    const old = oldFlyers.find(f => f.pageIds.length === group.pageIds.length) ?? (!affected ? oldFlyers[0] : null);
    // Stage each replacement before removing any old flyer, so a failed merge is retryable.
    const result = await api('/api/merge',{flyerId:old?.id ?? group.id,pages:group.pageIds.map(id => ({id,tiles:state.pages[id].tiles.filter(Boolean)})),scanDate:japanToday(),home:home()},signal);
    signal?.throwIfAborted();
    const stored = storable(result.flyer);
    if (affected) {
      staged.push(stored);
      if (stored.bucket === 'keep') {
        state.flyers=[...state.flyers.filter(f => !f.pageIds.some(id => stored.pageIds.includes(id))),stored]; save();
      }
      continue;
    }
    state.flyers = [...state.flyers.filter(f => !f.pageIds.some(id => group.pageIds.includes(id))),stored];
    // A page correction can change entry indices. Follow printed text/value, not the old index.
    for (const outing of state.outings) for (const used of [...outing.used]) {
      const previous = oldFlyers.find(f => f.id === used.flyerId); if (!previous) continue;
      const key = used.kind === 'offer' ? 'offers' : 'items', entry = previous[key]?.[used.index];
      const index = (stored[key] ?? []).findIndex(e => JSON.stringify({...e,page:null}) === JSON.stringify({...entry,page:null}));
      if (index >= 0) { used.flyerId = stored.id; used.index = index; }
      else outing.used = outing.used.filter(u => u !== used);
    }
    save(); chosenStops = null; groceryChoice = null; render();
  }
  if (affected) {
    const ids=new Set(selected.flatMap(g => g.pageIds));
    state.flyers=[...state.flyers.filter(f => !f.pageIds.some(id => ids.has(id))),...staged];
    for (const outing of state.outings) for (const used of [...outing.used]) {
      const old=originalFlyers.find(f => f.id === used.flyerId && f.pageIds.some(id => ids.has(id))); if (!old) continue;
      const key=used.kind === 'offer' ? 'offers' : 'items', entry=old[key]?.[used.index];
      const match=staged.map(f => ({f,index:(f[key] ?? []).findIndex(e => JSON.stringify({...e,page:null}) === JSON.stringify({...entry,page:null}))})).find(m => m.index >= 0);
      if (match) { used.flyerId=match.f.id; used.index=match.index; }
      else outing.used=outing.used.filter(u => u !== used);
    }
    save(); chosenStops=null; groceryChoice=null; render();
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
  busy=true; recovered=false; tab='mailbox'; notify();
  const session={batch,queue:[...batch],controller:new AbortController(),active:true,started:performance.now(),durations:[],message:''};
  reading=session;
  for (const p of batch) { p.status='waiting'; p.parts.clear(); p.error=''; }
  render(); $('reading-card').scrollIntoView({block:'start'}); $('reading-heading').focus({preventScroll:true});
  window.addEventListener('beforeunload',guardUnload); void acquireWakeLock(session);
  const timer=setInterval(updateReading,1000);
  let mergeWork=Promise.resolve();
  const sortReadings=() => {
    mergeWork=mergeWork.then(async () => {
      if (session.controller.signal.aborted) return;
      try { await mergeGroups(null,session.controller.signal); }
      catch (error) {
        if (error.name !== 'AbortError') {
          session.message=`Your readings are saved. Sorting failed: ${error.message}. Use Retry sorting saved readings.`; notify(session.message);
          if (error.status === 429) stopReading(error.message);
        }
      }
    });
  };
  try {
    // Commit all prepared images before the first request; IndexedDB failure falls back to memory.
    for (const p of batch) await storePhoto(p);
    await Promise.all(Array.from({length:Math.min(3,batch.length)},async () => {
      while (session.queue.length && !session.controller.signal.aborted) {
        const p=session.queue.shift();
        try { await readPage(p,session); sortReadings(); }
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
  return [...sortedWalks(),...state.flyers.filter(f => f.bucket !== 'walk' && f.bucket !== 'keep' && walkItems(f).length)];
}
function walkItems(f,o = null) {
  return (f.items ?? []).filter((_,index) => shoppingList.has(f.id+':'+index) || o?.shoppingList?.includes(f.id+':'+index) || o?.used?.some(u => u.flyerId === f.id && u.kind === 'item' && u.index === index));
}
function stopWarnings(f) {
  const warnings=[];
  if (expired(f)) warnings.push('Expired');
  if (f.location && arrivalStatus(f,walkMinutes(distanceMeters(home(),f.location))) === 'closed') warnings.push("Closed when you'd arrive");
  if (state.labels[f.id] === 0) warnings.push('You said 👎');
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
function shortDate(value) { return formatDate(value).replace(/ \d{4}$/, ''); }
function stopReason(f,o = null) {
  if (!f) return '';
  const selected = walkItems(f,o);
  let text = '';
  if (selected.length) text = selected.map(i => `${i.name_en ?? i.name_ja ?? 'Item'} ${money(i.price_yen)}`).join(' · ');
  else {
    const best = [...(f.offers ?? [])].sort((a,b) => (printedValue(b) ?? -1)-(printedValue(a) ?? -1))[0];
    if (best) { const value = printedValue(best); text = `${best.text_en ?? 'Printed offer'}${value !== null ? ` · worth ${money(value)} as printed` : ''}`; }
    else text = f.summary_en || (f.deadline ? `until ${shortDate(f.deadline)}` : 'Worth a walk');
  }
  return text ? `<p class="cw-stop-reason cw-muted">${escape(text)}</p>` : '';
}
function routeList(o,points) {
  let previous = o.start;
  const rows = points.map(p => { const minutes = walkMinutes(distanceMeters(previous,p)); previous = p; return `<li><p class="cw-meta">${minutes} min walking</p><strong lang="ja">${escape(p.name)}</strong>${stopReason(flyer(p.id),o)}</li>`; });
  rows.push(`<li><p class="cw-meta">${walkMinutes(distanceMeters(previous,o.end))} min walking</p><strong>${o.end.stationId === state.settings.home ? 'Home' : 'Train station'} · ${escape(stationName(o.end))}</strong></li>`);
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
function stopChoice(f) {
  const warnings=stopWarnings(f), h=home();
  const distance=f.location ? estimates(distanceMeters(h,f.location)) : null;
  const status=warnings.length ? warnings.join(' · ') : distance ? `${(distance.routeMeters/1000).toFixed(1)} km · ~${distance.minutes} min each way` : 'No location yet';
  const lookup=!f.location ? `<p class="cw-meta">${warnings.length ? 'No location yet' : ''}</p><form data-locate="${escape(f.id)}"><label class="cw-field">Type the address<input name="address" required maxlength="300" placeholder="Printed address or business name"></label><button type="submit" ${busy ? 'disabled' : ''}>Find address</button></form><a class="cw-link" href="${escape('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(f.business?.name ?? 'Flyer stop'))}" target="_blank" rel="noopener noreferrer">Find on Google Maps</a>` : '';
  return `<div class="cw-stop-choice ${warnings.length ? 'cw-stop-warning' : ''}" data-stop-choice="${escape(f.id)}"><label class="cw-check"><input type="checkbox" data-stop="${escape(f.id)}" ${stopSelected(f) ? 'checked' : ''}><span><strong lang="ja">${escape(f.business?.name ?? 'Flyer stop')}</strong>${stopReason(f)}<span class="cw-meta">${escape(status)}</span></span></label>${lookup}</div>`;
}
function droppedStops(p) {
  if (!p?.dropped.length) return '';
  return `<section class="cw-dropped"><h3>Didn't fit in ${state.settings.maxMinutes} min</h3><ul>${p.dropped.map(s => `<li>${escape(s.name)}</li>`).join('')}</ul><div class="cw-actions">${[60,90].filter(n => n>state.settings.maxMinutes).map(n => `<button data-action="extend-walk" data-minutes="${n}">Make it ${n} min</button>`).join('')}</div></section>`;
}
function planTitle(p) {
  return p.mode === 'train' ? `Take the train to ${escape(stationName(p.start))}, then walk · ${(estimates(p.meters).routeMeters/1000).toFixed(1)} km · ~${p.minutes} min` : p.start.stationId !== state.settings.home ? `Get off one stop early at ${escape(stationName(p.start))}` : 'Walk from your home station';
}
function renderWalk() {
  const active = state.outings.find(o => o.status === 'active');
  if (active) return `<h1>Your walk is underway.</h1><p class="cw-muted">${active.mode === 'train' ? planTitle(active)+'<br>' : ''}${escape(stationName(active.start))} → ${escape(stationName(active.end))}</p>${activeWalk(active)}<button class="cw-primary" data-action="finish" data-id="${escape(active.id)}">Finish walk</button>`;
  if (!home()) return '<h1>Make room for a walk.</h1><p>Set your home station to plan a route.</p><button data-action="settings">Set up your walk</button>';
  const list = candidates(), p = plan();
  const suggested = p?.stops.length ? groceryOnTheWay([p.start,...p.stops,p.end],stores)[0]?.store : null;
  return `<h1>A little walk home.</h1><p class="cw-muted">Up to ${state.settings.maxMinutes} min · home station: ${escape(stationName(home()))}</p><h2>Choose your stops</h2>${list.length ? list.map(stopChoice).join('') : '<p class="cw-muted">Read a worth-a-walk flyer or tick items for your walk list to find a stop.</p>'}${suggested ? `<div class="cw-entry"><h3>Groceries on the way</h3><p>${escape(suggested.name)}</p><p class="cw-muted">${escape(groceryNote(suggested))}</p><label class="cw-check"><input type="checkbox" data-grocery="${escape('store:'+suggested.branchId)}" ${groceryChoice ? 'checked' : ''}>Include grocery stop</label></div>` : ''}<button data-action="plan" class="cw-primary" ${!p?.stops.length ? 'disabled' : ''}>Plan walk</button>${p?.stops.length ? planCard(p) : list.length ? `<p class="cw-muted">${p?.dropped.length ? 'Try a longer walk to include your selected stops.' : 'Choose a stop above, or type its address to plan your walk.'}</p>${droppedStops(p)}` : ''}`;
}
function planCard(p) {
  return `<div class="cw-plan"><h2>${planTitle(p)}</h2>${routeList(p,p.stops)}<p class="cw-meta">${totals(p)}</p>${droppedStops(p)}${mapRoute(p,p.stops)}<div class="cw-actions"><button class="cw-primary" data-action="start">Start walk</button></div></div>`;
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
  document.body.classList.toggle('cw-has-photos',tab === 'mailbox' && !setupOpen && photos.length > 0 && !reading);
  updateReading();
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
  state.outings.push({id:uid('o-'),createdAt:now(),start:p.start,end:p.end,stopIds:p.stops.map(s => s.id),meters:p.meters,minutes:p.minutes,mode:p.mode,shoppingList:[...shoppingList],status,stamps:[],used:[]}); save(); render();
}
async function action(button) {
  const id = button.dataset.id;
  switch (button.dataset.action) {
    case 'settings': setupOpen = true; renderSetup(); render(); break;
    case 'close-setup': setupOpen = false; renderSetup(); render(); break;
    case 'take-photo': $('camera-input').click(); break;
    case 'choose-photos': $('photos-input').click(); break;
    case 'rotate': if (!busy && !preparing) {
      const p = photos.find(p => p.id === id); if (!p) break;
      preparing++; p.rotation = (p.rotation+90)%360; render();
      try { await preparePhoto(p); } finally { preparing--; render(); }
    } break;
    case 'remove-photo': if (!busy && !preparing) {
      const p = photos.find(p => p.id === id); if (!p) break;
      await photoDB('delete',id); URL.revokeObjectURL(p.url); photos = photos.filter(p => p.id !== id); render();
    } break;
    case 'read': await readPhotos(); break;
    case 'resume': await readPhotos(); break;
    case 'stop-reading': stopReading(); break;
    case 'retry-page': {
      const p=photos.find(p => p.id === id); if (!p || p.status !== 'failed') break;
      if (reading?.active && !reading.controller.signal.aborted) {
        p.status='waiting'; p.error=''; p.parts.clear(); reading.queue.push(p); updateReading();
      } else await readPhotos([id]);
      break;
    }
    case 'discard': if (!busy && !preparing) {
      for (const p of photos) { await photoDB('delete',p.id); URL.revokeObjectURL(p.url); }
      photos=[]; recovered=false; reading=null; render();
    } break;
    case 'continue-walk': changeTab('walk'); break;
    case 'rate': if (flyer(id)?.bucket === 'keep') break; state.labels[id] = Number(button.dataset.label); save(); render(); await rank(); break;
    case 'merge-retry': if (!busy) { busy = true; render(); try { await mergeGroups(); } finally { busy = false; render(); } } break;
    case 'plan': { const p = plan(); if (p?.stops.length) { newOuting(p,'planned'); notify('Walk planned. Start when you are ready.'); } break; }
    case 'extend-walk': {
      const minutes=Number(button.dataset.minutes); if (![60,90].includes(minutes)) break;
      state.settings.maxMinutes=minutes; save();
      const p=plan(); if (p?.stops.length) newOuting(p,'planned'); else render();
      notify(`Walk re-planned for up to ${minutes} min.`); break;
    }
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
    const files=[...input.files].filter(file => file.type.startsWith('image/'));
    input.value = '';
    photoWork=photoWork.then(() => addPhotos(files)); safely(() => photoWork);
  } else if (input.dataset.stop) {
    if (chosenStops === null) chosenStops = new Set(candidates().filter(stopSelected).map(f => f.id));
    if (input.checked) chosenStops.add(input.dataset.stop); else chosenStops.delete(input.dataset.stop); render();
  } else if (input.dataset.grocery) { groceryChoice = input.checked ? input.dataset.grocery : null; render(); }
  else if (input.dataset.shopping) { const key = input.dataset.shopping+':'+input.dataset.index; if (input.checked) { shoppingList.add(key); if (chosenStops !== null) chosenStops.add(input.dataset.shopping); } else shoppingList.delete(key); save(); }
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
      try { const result = await api('/api/locate?'+query); if (pointValid(result.location)) { f.location = result.location; f.needsLookup = false; save(); notify('Location found. Your walk has been updated.'); render(); await rank(); } else notify('No location found. Try the printed address or the full business name.'); }
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
document.addEventListener('visibilitychange',() => { if (reading?.active) void acquireWakeLock(reading); });
window.addEventListener('pagehide',() => { stopReading(); void releaseWakeLock(); });
renderSetup(); render();
await recoverPhotos();
try {
  const response = await fetch('/station-coordinates.json'); if (!response.ok) throw new Error();
  coordinates = await response.json(); render();
} catch { notify('Station coordinates could not be loaded. Reload to set up or plan a walk.'); }
try { const config = await api('/api/config'); $('mode').textContent = config.mode === 'cloud' ? 'Gemma 4 · cloud' : config.mode === 'local' ? 'Local Gemma — check every price' : 'Demo mode'; }
catch { $('mode').textContent = 'Reading service unavailable · try reloading'; }
save(); await rank();
