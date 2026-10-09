// Date strings are Japan civil dates, never browser UTC timestamps.
export const SNAPSHOT = '2026-10-09';
export function japanToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function nextBonus(date) {
  const start = new Date(`${date}T12:00:00+09:00`);
  for (let i = 0; i < 35; i++) {
    const day = japanToday(new Date(start.getTime() + i * 86400000));
    const n = Number(day.slice(-2));
    if ([5,15,20,25,30].includes(n)) return {date:day,multiplier:[20,30].includes(n)?5:2};
  }
  throw new Error('No bonus date found');
}
export function programs(chain,date) {
  if (chain === 'seiyu') return date <= '2027-04-04' ? ['rakuten'] : [];
  return ({tokyu:['rakuten','tokyu'],mybasket:['waon'],ok:['ok'],keio:['rakuten','keio'],life:['dpoint','ponta','lacuca'],welcia:['vpoint','waon'],sanwa:['sanwa']})[chain] || [];
}
export function storePrograms(store,date) {
  if(!rulesUsable(store))return [];
  const listed=programs(store.chain,date);
  return store.verifiedPrograms ? listed.filter(p=>store.verifiedPrograms.includes(p)) : listed;
}
export function rulesUsable(store,today=japanToday()) {
  if(!store.ruleStatus)return true;
  const rule=store.ruleStatus;
  return rule.status==='verified'&&Number.isFinite(Date.parse(rule.checkedAt))&&(new Date(today+'T12:00:00+09:00')-new Date(rule.checkedAt))<=14*86400000;
}
export function matches(store,wallet,date) {
  return wallet.some(p=>storePrograms(store,date).includes(p));
}
export function reward(chain,date) {
  if (chain==='mybasket') {
    const n=Number(date.slice(-2));
    return [20,30].includes(n)?5:[5,15,25].includes(n)?2:1;
  }
  return 1;
}
export function orderStores(stores,wallet,date) {
  // Unknown walks come last. Wallet match is preference, not predicted savings.
  return [...stores].sort((a,b)=>Number(matches(b,wallet,date))-Number(matches(a,wallet,date)) || (a.distanceMeters??(a.walk??999)*80)-(b.distanceMeters??(b.walk??999)*80));
}
export function retailerGroups(stores,wallet,date,onlyMatches=false) {
  const groups=new Map();
  for(const store of orderStores(stores,wallet,date)) {
    if(onlyMatches&&!matches(store,wallet,date))continue;
    if(!groups.has(store.chain))groups.set(store.chain,[]);
    groups.get(store.chain).push(store);
  }
  return [...groups.values()];
}
export function currentFlyers(flyers,branchId,date,today=japanToday()) {
  return flyers.filter(f=>f.branchId===branchId&&f.start<=date&&f.end>=date&&(new Date(today+'T12:00:00+09:00')-new Date(f.checkedAt))<=3*86400000);
}
export function nextWelciaDay(date){
 const day=Number(date.slice(-2));
 if(day<=20)return date.slice(0,8)+'20';
 const d=new Date(date+'T12:00:00+09:00');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);return japanToday(d).slice(0,8)+'20';
}
