import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stations,stores,stationsOnLine} from '../data/catalog.mjs';
import {WALK_M_PER_MIN,DETOUR,HOLIDAYS,distanceMeters,walkMinutes,estimates,dayType,parseHours,openStatus,neighbours,orderStops,planOuting,mapsLink,groceryOnTheWay} from '../src/walks.mjs';

const weekday='2026-10-13', saturday='2026-10-17';
const point=lon=>({lat:0,lon});
test('distance and walking estimates',()=>{
  const coordinates=JSON.parse(readFileSync(new URL('../data/station-coordinates.json',import.meta.url),'utf8'));
  const meters=distanceMeters(coordinates.find(s=>s.id==='hikifune'),coordinates.find(s=>s.id==='higashi-mukojima'));
  assert.ok(meters>650&&meters<750);
  assert.equal(distanceMeters(point(0),point(0)),0);
  assert.equal(WALK_M_PER_MIN,80);assert.equal(DETOUR,1.3);
  assert.equal(walkMinutes(800),13);
  assert.deepEqual(estimates(1000,60),{routeMeters:1300,minutes:16,steps:1857,kcal:56});
  assert.deepEqual(estimates(1000),estimates(1000,60));
});
test('Japan civil weekends and holidays',()=>{
  assert.deepEqual(HOLIDAYS,['2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29']);
  for(const holiday of HOLIDAYS)assert.equal(dayType(holiday),'weekend');
  assert.equal(dayType(weekday),'weekday');assert.equal(dayType(saturday),'weekend');
});
test('hours parsing and opening status',()=>{
  const cases=[
    ['09:30–22:00',weekday,600,'open'],['09:30–22:00',weekday,1380,'closed'],['09:30–22:00',weekday,540,'closed'],
    ['09:30–00:00',weekday,1439,'open'],['7:00-25:00',weekday,30,'open'],['7:00-25:00',weekday,360,'closed'],
    ['00:00〜03:00 / 04:00〜24:00 · retail',weekday,120,'open'],['00:00〜03:00 / 04:00〜24:00 · retail',weekday,210,'closed'],
    ['9：00〜22：00',weekday,1260,'open'],['平日 8:00～22:00 土日祝 9:00～21:00',weekday,510,'open'],
    ['平日 8:00～22:00 土日祝 9:00～21:00',saturday,510,'closed'],['平日 8:00～22:00 土日祝 9:00～21:00','2026-10-12',510,'closed'],
    ['平日 8:00～22:00 土日祝 9:00～21:00',saturday,1230,'open'],
    ['9:00-22:00（土曜・日曜・祝日は21:00閉店） テナント・専門店の営業時間は…',weekday,1290,'open'],
    ['9:00-22:00（土曜・日曜・祝日は21:00閉店） テナント・専門店の営業時間は…',saturday,1290,'closed'],
    ['08:30-21:30 免税の受付は、10:00-19:00です。',weekday,525,'open'],
    ['See official floor hours',weekday,600,'unknown'],['24 hours · grocery floors',weekday,180,'open']
  ];
  for(const [hours,date,minute,status] of cases)assert.equal(openStatus({hours},date,minute),status,`${hours} ${date} ${minute}`);
  assert.deepEqual(parseHours('09:30–00:00'),{all:[[570,1440]]});
  assert.deepEqual(parseHours('7:00-25:00'),{all:[[420,1500]]});
  assert.deepEqual(parseHours('00:00〜03:00 / 04:00〜24:00 · retail'),{all:[[0,180],[240,1440]]});
  assert.deepEqual(parseHours('平日 8:00～22:00 土日祝 9:00～21:00'),{weekday:[[480,1320]],weekend:[[540,1260]]});
  assert.deepEqual(parseHours('０９：３０－２５：３０'),{all:[[570,1530]]});
  assert.deepEqual(parseHours('平日9:00‐23:00 土日祝9:00‐22:00'),{weekday:[[540,1380]],weekend:[[540,1320]]});
  assert.deepEqual(parseHours('09:00–00:00 / 09:30–00:00'),{all:[[540,1440],[570,1440]]});
  for(const hours of ['24時間','24 HOURS'])assert.deepEqual(parseHours(hours),{all:[[0,1440]]});
  for(const hours of ['See official floor hours','',null,42,{}])assert.equal(parseHours(hours),null);
  assert.equal(openStatus({hours:'09:30–22:00'},weekday,570),'open');
  assert.equal(openStatus({hours:'09:30–22:00'},weekday,1320),'closed');
});
test('structured day hours win and midnight spill uses the previous schedule',()=>{
  const names=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const store={hours:'See official floor hours',hoursByDay:names.map(name=>({name,openTime:'09:30:00',closeTime:'22:00:00',hourType:1}))};
  assert.equal(openStatus(store,weekday,600),'open');
  assert.equal(openStatus({...store,hours:'24 hours'},weekday,180),'closed');
  store.hoursByDay[2].closeTime='00:00:00';
  assert.equal(openStatus(store,weekday,1439),'open');
  const changing={hours:'平日 7:00-25:00 土日祝 9:00-22:00'};
  assert.equal(openStatus(changing,saturday,30),'open');
  assert.equal(openStatus(changing,'2026-10-19',30),'closed');
  store.hoursByDay[5].closeTime='25:00:00';
  assert.equal(openStatus(store,saturday,30),'open');
  assert.equal(openStatus(store,saturday,60),'closed');
});
test('every catalog hours format is safe and at least 70 are readable',()=>{
  const values=[...new Set(stores.map(s=>s.hours))];
  let readable=0;
  for(const value of values)assert.doesNotThrow(()=>{if(parseHours(value))readable++;},value);
  assert.ok(readable>=70,`${readable}/${values.length} formats readable`);
});
test('line neighbours, endpoints, pilot exclusion and branch membership',()=>{
  const ids=(id,steps=1)=>neighbours(stations,stationsOnLine,id,steps).map(row=>row.station.id).sort();
  assert.deepEqual(ids('hikifune'),['higashi-mukojima','oshiage']);
  assert.deepEqual(ids('asakusa'),['tokyo-skytree']);
  assert.deepEqual(ids('koenji'),[]);
  assert.deepEqual(ids('hikifune',2),['kanegafuchi','tokyo-skytree']);
  const branch=neighbours(stations,stationsOnLine,'shitte');
  assert.deepEqual([...new Set(branch.map(row=>row.lineId))].sort(),['nambu','nambu-branch']);
  assert.equal(new Set(branch.map(row=>row.station.id)).size,branch.length);
  const shared=[{id:'asakusa',lineId:'a',lineIds:['a','b']},{id:'tokyo-skytree',lineId:'a'}];
  assert.equal(neighbours(shared,()=>shared,'asakusa').length,1);
});
test('stop ordering minimises small routes and handles empty and large routes',()=>{
  const start=point(0), end=point(0.04), stops=[point(0.03),point(0.01),point(0.02)];
  const result=orderStops(start,end,stops);
  assert.deepEqual(result.stops,[stops[1],stops[2],stops[0]]);
  assert.ok(Math.abs(result.meters-6371000*Math.PI/180*0.04)<1);
  assert.deepEqual(stops.map(s=>s.lon),[0.03,0.01,0.02]);
  assert.deepEqual(orderStops(start,end,[]),{stops:[],meters:distanceMeters(start,end)});
  const many=[7,6,5,4,3,2,1].map(n=>point(n/1000));
  const large=orderStops(start,point(0.008),many);
  assert.deepEqual(large.stops,[...many].reverse());
  assert.ok(Math.abs(large.meters-distanceMeters(start,point(0.008)))<1);
});
test('outing drops stops in priority order until within budget',()=>{
  const start=point(0), end=point(0.001), stops=[point(0.0005),{lat:0.01,lon:0.001}];
  const short=planOuting({start,end,stops,maxMinutes:5});
  assert.deepEqual(short.dropped,[stops[1]]);assert.deepEqual(short.stops,[stops[0]]);
  assert.equal(short.start,start);assert.equal(short.end,end);
  assert.equal(short.minutes,walkMinutes(short.meters));assert.deepEqual(short.estimates,estimates(short.meters));
  const full=planOuting({start,end,stops,maxMinutes:100});
  assert.equal(full.stops.length,2);assert.deepEqual(full.dropped,[]);
  const impossible=planOuting({start,end,stops,maxMinutes:0});
  assert.deepEqual(impossible.dropped,[stops[1],stops[0]]);assert.deepEqual(impossible.stops,[]);
  assert.deepEqual(stops,[point(0.0005),{lat:0.01,lon:0.001}]);
});
test('maps links encode coordinates, queries and up to three waypoints',()=>{
  const link=mapsLink(point(0),[point(0.01),point(0.02),point(0.03),point(0.04)],point(0.05));
  assert.equal(link,'https://www.google.com/maps/dir/?api=1&origin=0.000000%2C0.000000&destination=0.000000%2C0.050000&travelmode=walking&waypoints=0.000000%2C0.010000%7C0.000000%2C0.020000%7C0.000000%2C0.030000');
  assert.equal(mapsLink({query:'asakusa & gate'},[{query:'tokyo-skytree'}],{query:'oshiage'}),'https://www.google.com/maps/dir/?api=1&origin=asakusa%20%26%20gate&destination=oshiage&travelmode=walking&waypoints=tokyo-skytree');
  assert.ok(!mapsLink(point(0),[],point(1)).includes('waypoints'));
});
test('grocery detours use the best segment, filter distant stores and deduplicate branches',()=>{
  const route=[point(0),point(0.01),point(0.02)];
  const near={branchId:'near',lat:0,lon:0.015}, far={branchId:'far',lat:0.009,lon:0.005};
  const result=groceryOnTheWay(route,[near,{...near},far,{branchId:'bad',lat:'0',lon:0}]);
  assert.equal(result.length,1);assert.equal(result[0].store,near);
  assert.equal(result[0].segment,1);assert.ok(Math.abs(result[0].detour)<0.001);
  const wider=groceryOnTheWay(route,[far,near],2000);
  assert.deepEqual(wider.map(row=>row.store.branchId),['near','far']);
  assert.ok(wider[1].detour>300);
});
