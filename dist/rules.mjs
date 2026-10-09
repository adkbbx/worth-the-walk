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
  return ({tokyu:['rakuten','tokyu'],mybasket:['waon'],ok:['ok'],keio:['rakuten','keio'],life:['dpoint','ponta','lacuca'],welcia:['vpoint','waon']})[chain] || [];
}
export function matches(store,wallet,date) {
  return wallet.some(p=>programs(store.chain,date).includes(p));
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
  return [...stores].sort((a,b)=>Number(matches(b,wallet,date))-Number(matches(a,wallet,date)) || (a.walk??999)-(b.walk??999));
}
