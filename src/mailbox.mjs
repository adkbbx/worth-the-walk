export const CATEGORIES = ['lesson','fitness','cleaning','shop','supermarket','drugstore','restaurant','clinic','event','food_delivery','buying_service','junk_removal','real_estate','official_or_personal','other'];
export const OFFER_KINDS = ['free_trial','discount','coupon','sale','campaign','other'];
export const BUCKETS = ['walk','home','keep','toss'];
export const IN_PERSON = ['lesson','fitness','cleaning','shop','supermarket','drugstore','restaurant','clinic','event'];

function text(value) {
  return typeof value==='string' ? value.trim().slice(0,300) || null : null;
}
function object(value) {
  return value && typeof value==='object' && !Array.isArray(value) ? value : {};
}
function list(value,limit) {
  return Array.isArray(value) ? value.slice(0,limit) : [];
}
function emptyTile() {
  return {business:{name:null,branch:null,kind:null},category:'other',summary_en:null,offers:[],items:[],address:null,phones:[],websites:[],hours:null,valid_from_text:null,valid_to_text:null,comes_to_you:false,delivery:false};
}
export function parseJsonLoose(value) {
  try {
    if(typeof value!=='string')return null;
    const s=value.replace(/```(?:json)?/gi,'').trim();
    const start=s.indexOf('{'),end=s.lastIndexOf('}');
    return start>=0 && end>=start ? JSON.parse(s.slice(start,end+1)) : null;
  } catch { return null; }
}
export function yen(value) {
  if(typeof value==='string') {
    const s=value.normalize('NFKC').replace(/\s/g,'');
    const match=s.match(/^(?:税込|税抜)?[¥]?(\d+(?:,\d{3})*(?:\.\d+)?)円?$/);
    value=match ? Number(match[1].replace(/,/g,'')) : NaN;
  }
  return typeof value==='number' && Number.isFinite(value) && value>=0 ? Math.round(value) : null;
}
function percent(value) {
  if(typeof value==='string') {
    const s=value.normalize('NFKC').trim();
    value=/^\d+(?:\.\d+)?%?$/.test(s) ? Number(s.replace(/%$/,'')) : NaN;
  }
  return typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
}
export function normalizeTile(raw) {
  try {
    const r=object(raw),b=object(r.business),tile=emptyTile();
    for(const key of ['name','branch','kind'])tile.business[key]=text(b[key]);
    tile.category=CATEGORIES.includes(r.category) ? r.category : 'other';
    for(const key of ['summary_en','address','hours','valid_from_text','valid_to_text'])tile[key]=text(r[key]);
    tile.offers=list(r.offers,20).map(value=>{
      const o=object(value);
      return {text_ja:text(o.text_ja),text_en:text(o.text_en),kind:OFFER_KINDS.includes(o.kind)?o.kind:'other',regular_yen:yen(o.regular_yen),offer_yen:yen(o.offer_yen),discount_yen:yen(o.discount_yen),percent_off:percent(o.percent_off),deadline_text:text(o.deadline_text)};
    });
    tile.items=list(r.items,60).map(value=>{
      const i=object(value);
      return {name_ja:text(i.name_ja),name_en:text(i.name_en),price_yen:yen(i.price_yen),price_tax_incl_yen:yen(i.price_tax_incl_yen),regular_yen:yen(i.regular_yen),regular_label:text(i.regular_label),unit:text(i.unit),conditions:list(i.conditions,Infinity).map(text).filter(Boolean)};
    }).filter(i=>i.name_ja!==null && i.price_yen!==null);
    for(const key of ['phones','websites'])tile[key]=list(r[key],5).map(text).filter(Boolean);
    tile.comes_to_you=Boolean(r.comes_to_you);
    tile.delivery=Boolean(r.delivery);
    return tile;
  } catch { return emptyTile(); }
}
export function phoneKey(phone) {
  if(typeof phone!=='string')return null;
  const digits=phone.normalize('NFKC').replace(/\D/g,'');
  return /^\d{10,11}$/.test(digits) ? digits : null;
}
export function domainKey(value) {
  try {
    if(typeof value!=='string')return null;
    const s=value.normalize('NFKC').trim();
    if(!s || /\s/.test(s))return null;
    const url=new URL(s.includes('://') ? s : 'https://'+s);
    if(!['http:','https:'].includes(url.protocol))return null;
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? host : null;
  } catch { return null; }
}
export function normText(s) {
  return typeof s==='string' ? s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}ー]/gu,'') : '';
}
export function pageKeys(tiles) {
  const keys=new Set();
  for(const tile of list(tiles,Infinity)) {
    for(const phone of list(tile?.phones,Infinity)) {
      const key=phoneKey(phone);if(key)keys.add('tel:'+key);
    }
    for(const website of list(tile?.websites,Infinity)) {
      const key=domainKey(website);if(key)keys.add('web:'+key);
    }
    const name=normText(tile?.business?.name),address=normText(tile?.address);
    if(name && address)keys.add('name:'+name+'|'+address);
  }
  return [...keys];
}
export function groupPages(pages,overrides={}) {
  const parents=pages.map((_,i)=>i),automatic=new Map(),forced=new Map();
  function root(i) {
    while(parents[i]!==i) { parents[i]=parents[parents[i]];i=parents[i]; }
    return i;
  }
  function join(a,b) {
    a=root(a);b=root(b);parents[Math.max(a,b)]=Math.min(a,b);
  }
  pages.forEach((page,i)=>{
    if(Object.prototype.hasOwnProperty.call(overrides ?? {},page.id)) {
      const label=overrides[page.id];
      if(forced.has(label))join(i,forced.get(label));else forced.set(label,i);
      return;
    }
    for(const key of pageKeys(page.tiles)) {
      if(automatic.has(key))join(i,automatic.get(key));else automatic.set(key,i);
    }
  });
  const groups=new Map();
  pages.forEach((page,i)=>{
    const key=root(i);
    if(!groups.has(key))groups.set(key,{id:'f-'+page.id,pageIds:[]});
    groups.get(key).pageIds.push(page.id);
  });
  return [...groups.values()];
}
export function dedupeItems(items) {
  const seen=new Set();
  return items.filter(item=>{
    const key=normText(item.name_ja)+'|'+item.price_yen;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
export function mergeFallback(pages) {
  const flyer={...emptyTile(),id:'f-'+pages[0]?.id,pageIds:pages.map(p=>p.id)},categories=new Map();
  const phones=new Set(),websites=new Set(),offers=new Set();
  pages.forEach((p,page)=>{
    for(const raw of list(p.tiles,Infinity)) {
      const tile=normalizeTile(raw);
      for(const key of ['name','branch','kind'])flyer.business[key] ??= tile.business[key];
      for(const key of ['summary_en','address','hours','valid_from_text','valid_to_text'])flyer[key] ??= tile[key];
      if(tile.category!=='other')categories.set(tile.category,(categories.get(tile.category) || 0)+1);
      for(const offer of tile.offers) {
        const key=normText(offer.text_ja);
        if(!offers.has(key)) { offers.add(key);flyer.offers.push({...offer,page}); }
      }
      flyer.items.push(...tile.items.map(item=>({...item,page})));
      tile.phones.forEach(phone=>phones.add(phone));
      tile.websites.forEach(website=>websites.add(website));
      flyer.comes_to_you ||= tile.comes_to_you;
      flyer.delivery ||= tile.delivery;
    }
  });
  let most=0;
  for(const [category,count] of categories)if(count>most) { flyer.category=category;most=count; }
  flyer.items=dedupeItems(flyer.items);
  flyer.phones=[...phones];flyer.websites=[...websites];
  return {...flyer,bucket:bucketOf(flyer),needsLookup:needsLookup(flyer),deadline:null,chain:null};
}
export function bucketOf(flyer) {
  if(flyer.category==='official_or_personal')return 'keep';
  if(flyer.category==='food_delivery' || flyer.delivery)return 'home';
  if(['buying_service','junk_removal','real_estate'].includes(flyer.category) || flyer.comes_to_you)return 'toss';
  return IN_PERSON.includes(flyer.category) ? 'walk' : 'toss';
}
export function needsLookup(flyer) {
  return bucketOf(flyer)==='walk' && !text(flyer.address);
}
function civilDay(year,month,day) {
  if(year<1 || year>9999 || month<1 || month>12 || day<1 || day>31)return null;
  const date=new Date(0);
  date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? date.getTime() : null;
}
function dateDay(s) {
  const match=typeof s==='string' && s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? civilDay(Number(match[1]),Number(match[2]),Number(match[3])) : null;
}
export function parseDeadline(value,scanDate) {
  const scan=dateDay(scanDate);
  if(typeof value!=='string' || scan===null)return null;
  const s=value.normalize('NFKC');
  const matches=[...s.matchAll(/(?<!\d)(?:(?:令和\s*(元|\d+)\s*年)|(?:(\d{4})\s*(?:年|[/-])))?\s*(\d{1,2})\s*(?:月|[/-])\s*(\d{1,2})(?!\d)\s*日?/g)];
  if(!matches.length)return null;
  // The final printed date is the end of a range; reject impossible civil dates.
  const match=matches.at(-1),explicit=match[1]!==undefined || match[2]!==undefined;
  let year=match[1]!==undefined ? 2018+(match[1]==='元'?1:Number(match[1])) : Number(match[2] ?? scanDate.slice(0,4));
  if(match[1]!==undefined && Number(match[1])===0)return null;
  const month=Number(match[3]),day=Number(match[4]);
  let time=civilDay(year,month,day);
  if(time===null)return null;
  if(!explicit && scan-time>60*86400000) { year++;time=civilDay(year,month,day); }
  return time===null ? null : String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
export function finalizeFlyer(flyer,scanDate,chainOf=()=>null) {
  const dates=[flyer.valid_to_text,...list(flyer.offers,Infinity).map(o=>o.deadline_text)].map(s=>parseDeadline(s,scanDate)).filter(Boolean).sort();
  // Chain names like トップ or OK also appear inside unrelated business names, so only grocery flyers are matched.
  const grocery=['supermarket','drugstore'].includes(flyer.category);
  return {...flyer,bucket:bucketOf(flyer),needsLookup:needsLookup(flyer),deadline:dates[0] ?? null,chain:grocery?chainOf(flyer.business?.name ?? null):null};
}
export function storable(flyer) {
  return flyer.bucket==='keep' ? {id:flyer.id,pageIds:flyer.pageIds,bucket:'keep',category:flyer.category} : flyer;
}
export function printedValue(entry) {
  const e=object(entry),regular=yen(e.regular_yen),price=yen(e.offer_yen ?? e.price_yen),discount=yen(e.discount_yen),off=percent(e.percent_off);
  if(regular!==null && price!==null && regular>price)return regular-price;
  if(discount!==null)return discount;
  if(off!==null && regular!==null)return Math.round(regular*off/100);
  if(e.kind==='free_trial' && regular!==null && price===null)return regular;
  return null;
}
export function savings(used) {
  const result={yen:0,counted:0,uncounted:0};
  for(const value of used) {
    const amount=printedValue(value?.entry);
    if(amount===null)result.uncounted++;else { result.yen+=amount;result.counted++; }
  }
  return result;
}
export const CHAINS = {'オーケー':'ok','OK':'ok','まいばすけっと':'mybasket','ライフ':'life','東急ストア':'tokyu','ウエルシア':'welcia','西友':'seiyu','SEIYU':'seiyu','三和':'sanwa','フードワン':'sanwa','FUJI':'fuji','富士シティオ':'fuji','フレスコ':'fresco','業務スーパー':'gyomu','成城石井':'seijo','紀ノ国屋':'kinokuniya','三浦屋':'miuraya','キッチンコート':'keio','京王ストア':'keio','トップ':'top'};
export function matchChain(name) {
  if(typeof name!=='string')return null;
  const s=name.normalize('NFKC').toLowerCase();
  for(const [fragment,chain] of Object.entries(CHAINS)) {
    const match=/^[a-z]+$/i.test(fragment) ? new RegExp('(^|[^a-z0-9])'+fragment.toLowerCase()+'(?=$|[^a-z0-9])').test(s) : s.includes(fragment.normalize('NFKC').toLowerCase());
    if(match)return chain;
  }
  return null;
}
export function matchBranch(flyer,stores) {
  const branch=normText(flyer.business?.branch);
  if(!flyer.chain || !branch)return null;
  return stores.find(store=>store.chain===flyer.chain && normText(store.ja).includes(branch))?.branchId ?? null;
}
export const FEATURES = ['category','distance','offer','free_trial','value','days_left','comes_to_you','delivery','has_address'];
export function featureRow(flyer,{distanceMeters=null,today}) {
  const offers=list(flyer.offers,Infinity),items=list(flyer.items,Infinity);
  const distance=typeof distanceMeters==='number' && Number.isFinite(distanceMeters) && distanceMeters>=0 ? distanceMeters : Infinity;
  const values=[...offers,...items].map(printedValue).filter(value=>value!==null),value=values.length?Math.max(...values):null;
  const deadline=dateDay(flyer.deadline),now=dateDay(today),days=deadline!==null && now!==null ? (deadline-now)/86400000 : null;
  return [CATEGORIES.includes(flyer.category)?CATEGORIES.indexOf(flyer.category):CATEGORIES.indexOf('other'),distance<500?0:distance<1000?1:distance<2000?2:3,offers.length?OFFER_KINDS.indexOf(offers[0].kind):-1,Number(offers.some(o=>o.kind==='free_trial')),value===null?0:value<500?1:value<2000?2:3,days===null?0:days<0?-1:days<=3?1:days<=14?2:3,Number(Boolean(flyer.comes_to_you)),Number(Boolean(flyer.delivery)),Number(Boolean(text(flyer.address)))];
}
