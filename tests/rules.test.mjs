import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextBonus,programs,reward,japanToday,orderStores,matches} from '../src/rules.mjs';
import {stations,stores,walletOptions,stationsOnLine} from '../data/catalog.mjs';
test('Japan date crosses UTC day at midnight JST',()=>{assert.equal(japanToday(new Date('2026-10-09T15:00:00Z')),'2026-10-10');});
test('bonus dates cross month/year correctly and include selected date',()=>{assert.deepEqual(nextBonus('2026-10-09'),{date:'2026-10-15',multiplier:2});assert.deepEqual(nextBonus('2026-10-30'),{date:'2026-10-30',multiplier:5});assert.deepEqual(nextBonus('2026-12-31'),{date:'2027-01-05',multiplier:2});});
test('announcement date does not prematurely end SEIYU Rakuten',()=>{assert.deepEqual(programs('seiyu','2026-10-09'),['rakuten']);assert.deepEqual(programs('seiyu','2027-04-04'),['rakuten']);assert.deepEqual(programs('seiyu','2027-04-05'),[]);});
test('My Basket bonus is points multiplier, ordinary days get one',()=>{assert.equal(reward('mybasket','2026-10-20'),5);assert.equal(reward('mybasket','2026-10-15'),2);assert.equal(reward('mybasket','2026-10-09'),1);});
test('unknown programs never match a wallet and no wallet leaves distance order',()=>{assert.equal(matches({chain:'gyomu'},['rakuten'],'2026-10-09'),false);const samples=[{chain:'ok',walk:8},{chain:'mybasket',walk:3},{chain:'seiyu',walk:4}];assert.equal(orderStores(samples,[],'2026-10-09')[0].chain,'mybasket');assert.equal(orderStores(samples,['rakuten'],'2026-10-09')[0].chain,'seiyu');});
test('pilot coverage stays complete and expanded coverage has cited stores',()=>{assert.equal(new Set(stores.map(s=>s.id)).size,stores.length);for(const station of stations){const list=stores.filter(s=>s.station===station.id);assert.ok(list.length<=10);if(station.lineId==='pilot')assert.ok(list.length>=5);for(const s of list)assert.ok(new URL(s.url).protocol==='https:');}});
test('requested routes include every station and correct branch endpoints',()=>{
  assert.equal(stations.length,74);assert.equal(new Set(stations.map(s=>s.id)).size,74);
  assert.equal(stationsOnLine(stations,'nambu').length,26);
  assert.deepEqual(stationsOnLine(stations,'nambu-branch').map(s=>s.id),['shitte','hatcho-nawate','kawasaki-shinmachi','odasakae','hama-kawasaki']);
  const dt=stationsOnLine(stations,'den-en-toshi');assert.equal(dt.length,27);assert.equal(dt[0].id,'shibuya');assert.equal(dt.at(-1).id,'chuo-rinkan');
  const ts=stationsOnLine(stations,'skytree');assert.equal(ts.length,14);assert.ok(ts.some(s=>s.id==='oshiage'));assert.equal(ts.at(-1).id,'takenotsuka');
  assert.equal(stations.find(s=>s.id==='takatsu').region,'神奈川県');
});
test('major point programs match only verified affiliations',()=>{
  for(const id of ['dpoint','vpoint','ponta','paypay','nanaco','jre','tobu'])assert.ok(walletOptions.some(p=>p.id===id));
  assert.ok(matches({chain:'life'},['dpoint'],'2026-10-09'));assert.ok(matches({chain:'welcia'},['vpoint'],'2026-10-09'));
  assert.equal(matches({chain:'welcia'},['dpoint','paypay'],'2026-10-09'),false);
  assert.equal(matches({chain:'maruetsu'},['vpoint'],'2026-10-09'),false);
});
