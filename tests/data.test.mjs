import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {stations,stores,researchSummary} from '../data/catalog.mjs';
import {branches} from '../data/researched.mjs';
import {currentFlyers,storePrograms,rulesUsable,nextWelciaDay} from '../src/rules.mjs';
const flyers=JSON.parse(await readFile(new URL('../data/flyers.json',import.meta.url),'utf8'));
test('unique branches and valid station associations without pharmacy-only recommendations',()=>{
 assert.equal(new Set(branches.map(b=>b.branchId)).size,branches.length);
 assert.equal(branches.length,researchSummary.branches);
 for(const b of branches){assert.ok(b.checkedAt&&Number.isFinite(Date.parse(b.checkedAt)),b.branchId);assert.ok(b.address&&b.url,b.branchId);if(b.chain==='welcia')assert.doesNotMatch(b.ja,/調剤薬局/);}
 for(const s of stores){assert.ok(stations.some(st=>st.id===s.station));assert.ok(s.distanceMeters===null||s.distanceMeters<=2500||s.stationIds?.includes(s.station)||s.legacyAccess?.[s.station]);}
});
test('similar station names never borrow walking times',()=>{
 assert.equal(stores.find(s=>s.station==='koenji'&&s.branchId==='mybasket-4270').walk,null,'東高円寺 is not 高円寺');
 assert.equal(stores.find(s=>s.station==='koenji'&&s.branchId==='mybasket-8155').walk,3);
 assert.equal(stores.filter(s=>s.station==='koenji'&&s.ja.normalize('NFKC').replace(/\s/g,'')==='まいばすけっと高円寺南5丁目店').length,1);
});
test('flyer validity uses dates, branch scope and original check time',()=>{
 const f={branchId:'x',start:'2026-10-09',end:'2026-10-13',checkedAt:'2026-10-09T12:00:00+09:00'};
 assert.equal(currentFlyers([f],'x','2026-10-10','2026-10-10').length,1);
 assert.equal(currentFlyers([f],'y','2026-10-10','2026-10-10').length,0);
 assert.equal(currentFlyers([f],'x','2026-10-14','2026-10-10').length,0);
 assert.equal(currentFlyers([f],'x','2026-10-13','2026-10-13').length,0);
 for(const f of flyers){assert.ok(branches.some(b=>b.branchId===f.branchId));assert.ok(f.start<=f.end);assert.ok(['advertised','publication'].includes(f.windowKind));assert.ok(new URL(f.source).protocol==='https:');}
});
test('branch card flags and changed/stale rules override chain defaults',()=>{
 assert.deepEqual(storePrograms({chain:'life',verifiedPrograms:['lacuca']},'2026-10-10'),['lacuca']);
 assert.deepEqual(storePrograms({chain:'life',verifiedPrograms:[]},'2026-10-10'),[]);
 assert.equal(rulesUsable({ruleStatus:{status:'review-needed',checkedAt:'2026-10-10'}}),false);
 assert.equal(rulesUsable({ruleStatus:{status:'verified',checkedAt:'2026-10-01T00:00:00+09:00'}},'2026-10-20'),false);
 assert.equal(nextWelciaDay('2026-10-21'),'2026-11-20');assert.equal(nextWelciaDay('2026-12-31'),'2027-01-20');
});
