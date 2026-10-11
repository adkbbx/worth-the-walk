import {test} from 'node:test';import assert from 'node:assert/strict';
import {CATEGORIES,OFFER_KINDS,BUCKETS,IN_PERSON,parseJsonLoose,yen,normalizeTile,phoneKey,domainKey,normText,pageKeys,groupPages,dedupeItems,mergeFallback,bucketOf,needsLookup,parseDeadline,finalizeFlyer,storable,printedValue,savings,CHAINS,matchChain,matchBranch,FEATURES,featureRow} from '../src/mailbox.mjs';

const tile=raw=>normalizeTile(raw);
const page=(id,raw)=>({id,tiles:[tile(raw)]});
const empty={business:{name:null,branch:null,kind:null},category:'other',summary_en:null,offers:[],items:[],address:null,phones:[],websites:[],hours:null,valid_from_text:null,valid_to_text:null,comes_to_you:false,delivery:false};

test('exported vocabularies match the contract',()=>{
  assert.deepEqual(CATEGORIES,['lesson','fitness','cleaning','shop','supermarket','drugstore','restaurant','clinic','event','food_delivery','buying_service','junk_removal','real_estate','official_or_personal','other']);
  assert.deepEqual(OFFER_KINDS,['free_trial','discount','coupon','sale','campaign','other']);
  assert.deepEqual(BUCKETS,['walk','home','keep','toss']);
  assert.deepEqual(IN_PERSON,CATEGORIES.slice(0,9));
  assert.deepEqual(FEATURES,['category','distance','offer','free_trial','value','days_left','comes_to_you','delivery','has_address']);
});
test('parseJsonLoose reads fenced and prose-wrapped JSON without throwing',()=>{
  assert.deepEqual(parseJsonLoose('```json\n{"business":{"name":"テスト教室"}}\n```'),{business:{name:'テスト教室'}});
  assert.deepEqual(parseJsonLoose('Here is the result: {"offers":[{"text_ja":"体験"}]} End.'),{offers:[{text_ja:'体験'}]});
  assert.deepEqual(parseJsonLoose('```\n{"ok":true}\n```'),{ok:true});
  for(const value of ['bad','{bad}',null,{},'{"a":1} {"b":2}','[1,2]'])assert.equal(parseJsonLoose(value),null);
});
test('yen normalizes printed currency and rejects missing or invalid values',()=>{
  for(const [value,expected] of [['1,080円',1080],['¥3,300',3300],['３３００',3300],['税込 1,166円',1166],['￥３，３００',3300],[0,0],[12.6,13],['12.6円',13]])assert.equal(yen(value),expected);
  for(const value of [null,undefined,NaN,Infinity,-1,'-1円','','free','100円～200円',true,{},'1,08円'])assert.equal(yen(value),null);
});
test('normalizeTile returns a complete empty tile for garbage',()=>{
  for(const raw of [null,undefined,42,'garbage',[],{}, {business:[],offers:'bad',items:[null],phones:42}])assert.deepEqual(tile(raw),empty);
  const raw={get business(){throw new Error('unreadable');}};
  assert.deepEqual(tile(raw),empty);
});
test('normalizeTile sanitizes enums, text, money, booleans and items',()=>{
  const result=tile({business:{name:'  テスト教室  ',branch:' ',kind:'x'.repeat(400)},category:'unknown',summary_en:'x'.repeat(400),address:' 東京都テスト区1-2-3 ',offers:[{kind:'unknown',text_ja:' 体験 ',regular_yen:'3,300円',offer_yen:'0円',percent_off:'２０％'}],items:[{name_ja:'テストパン'},{price_yen:100},{name_ja:' テスト茶 ',name_en:' Tea ',price_yen:'158円',price_tax_incl_yen:'税込 171円',regular_yen:198,regular_label:' 通常 ',unit:' 個 ',conditions:[' 会員限定 ','',null,42]},{name_ja:'無料の品',price_yen:0}],comes_to_you:1,delivery:0});
  assert.deepEqual(result.business,{name:'テスト教室',branch:null,kind:'x'.repeat(300)});
  assert.equal(result.category,'other');assert.equal(result.summary_en.length,300);
  assert.equal(result.address,'東京都テスト区1-2-3');assert.equal(result.offers[0].kind,'other');
  assert.equal(result.offers[0].regular_yen,3300);assert.equal(result.offers[0].offer_yen,0);assert.equal(result.offers[0].percent_off,20);
  assert.deepEqual(result.items,[{name_ja:'テスト茶',name_en:'Tea',price_yen:158,price_tax_incl_yen:171,regular_yen:198,regular_label:'通常',unit:'個',conditions:['会員限定']},{name_ja:'無料の品',name_en:null,price_yen:0,price_tax_incl_yen:null,regular_yen:null,regular_label:null,unit:null,conditions:[]}]);
  assert.equal(result.comes_to_you,true);assert.equal(result.delivery,false);
});
test('normalizeTile caps every specified array and text field',()=>{
  const long='x'.repeat(400),result=tile({business:{name:long,branch:long,kind:long},summary_en:long,address:long,hours:long,valid_from_text:long,valid_to_text:long,offers:Array.from({length:25},()=>({text_ja:long,text_en:long,deadline_text:long})),items:Array.from({length:65},()=>({name_ja:long,name_en:long,regular_label:long,unit:long,conditions:[long],price_yen:1})),phones:Array(8).fill(long),websites:Array(8).fill(long)});
  assert.equal(result.offers.length,20);assert.equal(result.items.length,60);assert.equal(result.phones.length,5);assert.equal(result.websites.length,5);
  for(const value of [...Object.values(result.business),result.summary_en,result.address,result.hours,result.valid_from_text,result.valid_to_text,...result.phones,...result.websites,result.offers[0].text_ja,result.offers[0].text_en,result.offers[0].deadline_text,result.items[0].name_ja,result.items[0].name_en,result.items[0].regular_label,result.items[0].unit,result.items[0].conditions[0]])assert.equal(value.length,300);
});
test('comparison keys normalize phones, domains and punctuation',()=>{
  assert.equal(phoneKey('0120-000-111'),'0120000111');assert.equal(phoneKey('０９０ ００００ １１１１'),'09000001111');
  for(const value of [null,'123','0120-000-11122'])assert.equal(phoneKey(value),null);
  for(const value of ['https://www.example.co.jp/path','example.co.jp','HTTP://WWW.EXAMPLE.CO.JP/path'])assert.equal(domainKey(value),'example.co.jp');
  for(const value of [null,'bad','https://','javascript:alert(1)','ftp://example.co.jp','https://bad host.co.jp'])assert.equal(domainKey(value),null);
  assert.equal(normText(' ＡＢＣ ・、。-ー！ '),'abc');assert.equal(normText(null),'');
  assert.deepEqual(pageKeys([tile({business:{name:' テスト・教室 '},address:'東京都テスト区１－２－３',phones:['0120-000-111','0120 000 111'],websites:['https://www.example.co.jp/path']})]),['tel:0120000111','web:example.co.jp','name:テスト教室|東京都テスト区123']);
  assert.deepEqual(pageKeys([tile({business:{name:'テスト教室'}}),tile({address:'東京都テスト区1-2-3'})]),[]);
});
test('groupPages joins transitively by any key and preserves scan order',()=>{
  const pages=[page('p1',{phones:['0120-000-111']}),page('p2',{phones:['0120 000 111'],websites:['https://www.example.co.jp/flyer']}),page('p3',{websites:['example.co.jp']}),page('p4',{phones:['0120-000-222']}),page('p5',{business:{name:'テスト書店'},address:'東京都テスト区1-2-3'})];
  assert.deepEqual(groupPages(pages),[{id:'f-p1',pageIds:['p1','p2','p3']},{id:'f-p4',pageIds:['p4']},{id:'f-p5',pageIds:['p5']}]);
  assert.deepEqual(groupPages(pages,{p1:'separate',p4:'manual',p5:'manual'}),[{id:'f-p1',pageIds:['p1']},{id:'f-p2',pageIds:['p2','p3']},{id:'f-p4',pageIds:['p4','p5']}]);
  assert.deepEqual(groupPages([]),[]);
});
test('groupPages matches name plus address and isolates all overridden pages',()=>{
  const pages=[page('a',{business:{name:'テスト・書店'},address:'東京都テスト区１－２－３'}),page('b',{business:{name:'テスト 書店'},address:'東京都テスト区1-2-3'}),page('c',{business:{name:'別のテスト店'},address:'東京都テスト区1-2-3'}),page('d',{business:{name:'テスト書店'},address:'東京都テスト区4-5-6'})];
  assert.deepEqual(groupPages(pages),[{id:'f-a',pageIds:['a','b']},{id:'f-c',pageIds:['c']},{id:'f-d',pageIds:['d']}]);
  assert.deepEqual(groupPages(pages,{a:'one',b:'two'}),pages.map(p=>({id:'f-'+p.id,pageIds:[p.id]})));
  assert.deepEqual(groupPages(pages,{a:'one',b:'one'}),[{id:'f-a',pageIds:['a','b']},{id:'f-c',pageIds:['c']},{id:'f-d',pageIds:['d']}]);
});
test('dedupeItems keeps the first name and price combination',()=>{
  const first={name_ja:'テスト・茶',price_yen:158,page:0},same={name_ja:'テスト 茶',price_yen:158,page:1},different={name_ja:'テスト茶',price_yen:198,page:1};
  assert.deepEqual(dedupeItems([first,same,different]),[first,different]);
});
test('mergeFallback combines pages, dedupes entries and uses category majority',()=>{
  const pages=[{id:'front',tiles:[tile({business:{name:'テスト教室',kind:'教室'},category:'lesson',summary_en:'Try a lesson.',offers:[{text_ja:'無料・体験',kind:'free_trial',regular_yen:3300,offer_yen:0}],items:[{name_ja:'テスト 茶',price_yen:158}],phones:['0120-000-111'],websites:['https://example.co.jp'],hours:'10:00–18:00',valid_from_text:'10/1'}),tile({category:'shop',items:[{name_ja:'テスト・茶',price_yen:158}],delivery:true})]},{id:'back',tiles:[tile({business:{name:'後のテスト店',branch:'テスト支店'},category:'lesson',address:'東京都テスト区1-2-3',offers:[{text_ja:'無料 体験',kind:'free_trial'},{text_ja:'テスト割引',kind:'discount',discount_yen:500}],items:[{name_ja:'テスト茶',price_yen:198}],phones:['0120-000-111','0120-000-222'],websites:['https://example.co.jp','https://example.org'],hours:'12:00–19:00',valid_to_text:'10/31',comes_to_you:true})]}];
  const before=JSON.stringify(pages),flyer=mergeFallback(pages);
  assert.equal(flyer.id,'f-front');assert.deepEqual(flyer.pageIds,['front','back']);
  assert.deepEqual(flyer.business,{name:'テスト教室',branch:'テスト支店',kind:'教室'});
  assert.equal(flyer.category,'lesson');assert.equal(flyer.address,'東京都テスト区1-2-3');assert.equal(flyer.summary_en,'Try a lesson.');assert.equal(flyer.hours,'10:00–18:00');
  assert.equal(flyer.valid_from_text,'10/1');assert.equal(flyer.valid_to_text,'10/31');
  assert.deepEqual(flyer.offers.map(o=>[o.text_ja,o.page]),[['無料・体験',0],['テスト割引',1]]);
  assert.deepEqual(flyer.items.map(i=>[i.price_yen,i.page]),[[158,0],[198,1]]);
  assert.deepEqual(flyer.phones,['0120-000-111','0120-000-222']);assert.deepEqual(flyer.websites,['https://example.co.jp','https://example.org']);
  assert.equal(flyer.comes_to_you,true);assert.equal(flyer.delivery,true);assert.equal(flyer.bucket,'home');assert.equal(flyer.needsLookup,false);assert.equal(flyer.deadline,null);assert.equal(flyer.chain,null);
  assert.equal(JSON.stringify(pages),before);
  assert.equal(mergeFallback([page('blank',{})]).category,'other');
  assert.equal(mergeFallback([{id:'tie',tiles:[tile({category:'event'}),tile({category:'lesson'}),tile({category:'other'})]}]).category,'event');
});
test('bucketOf covers every category and flag precedence; needsLookup follows walk',()=>{
  const expected=['walk','walk','walk','walk','walk','walk','walk','walk','walk','home','toss','toss','toss','keep','toss'];
  CATEGORIES.forEach((category,i)=>{
    assert.equal(bucketOf(tile({category})),expected[i],category);
    assert.equal(bucketOf(tile({category,delivery:true})),category==='official_or_personal'?'keep':'home');
    assert.equal(bucketOf(tile({category,comes_to_you:true})),category==='official_or_personal'?'keep':category==='food_delivery'?'home':'toss');
    assert.equal(bucketOf(tile({category,delivery:true,comes_to_you:true})),category==='official_or_personal'?'keep':'home');
    assert.equal(needsLookup(tile({category})),expected[i]==='walk');
    assert.equal(needsLookup(tile({category,address:'東京都テスト区1-2-3'})),false);
  });
  assert.equal(needsLookup(tile({category:'shop',delivery:true})),false);
  assert.equal(needsLookup(tile({category:'shop',comes_to_you:true})),false);
});
test('parseDeadline handles Japanese, slash, Reiwa, range and full-width dates',()=>{
  for(const [value,expected] of [['11月30日(日)','2026-11-30'],['11/30','2026-11-30'],['2026年11月30日','2026-11-30'],['10/31(土)まで','2026-10-31'],['～10月31日','2026-10-31'],['令和8年11月30日','2026-11-30'],['9/25(金)～10/31(土)','2026-10-31'],['９／２５(金)～１０／３１(土)','2026-10-31'],['２０２６年１１月３０日','2026-11-30'],['令和８年１１月３０日','2026-11-30'],['2026-11-30','2026-11-30']])assert.equal(parseDeadline(value,'2026-10-11'),expected,value);
});
test('parseDeadline rolls only dates more than 60 days before the scan',()=>{
  assert.equal(parseDeadline('1/10','2026-12-20'),'2027-01-10');
  assert.equal(parseDeadline('10/1','2026-10-11'),'2026-10-01');
  assert.equal(parseDeadline('10/21','2026-12-20'),'2026-10-21');
  assert.equal(parseDeadline('10/20','2026-12-20'),'2027-10-20');
  assert.equal(parseDeadline('2026年1月10日','2026-12-20'),'2026-01-10');
  assert.equal(parseDeadline('令和元年11月30日','2026-10-11'),'2019-11-30');
  assert.equal(parseDeadline('2028年2月29日','2026-10-11'),'2028-02-29');
  for(const value of ['garbage','',null,'13/1','11/31','2026年2月29日','令和0年11月30日','9/25～10/32'])assert.equal(parseDeadline(value,'2026-10-11'),null);
  assert.equal(parseDeadline('11/30','invalid'),null);assert.equal(parseDeadline('11/30','2026-02-30'),null);
});
test('finalizeFlyer chooses the earliest valid deadline and calls the chain resolver',()=>{
  const flyer=mergeFallback([page('p1',{business:{name:'テスト青空店'},category:'supermarket',valid_to_text:'11/30',offers:[{text_ja:'割引一',deadline_text:'invalid'},{text_ja:'割引二',deadline_text:'10/31'},{text_ja:'割引三',deadline_text:'11/10'}]})]);
  const result=finalizeFlyer(flyer,'2026-10-11',name=>{assert.equal(name,'テスト青空店');return 'synthetic';});
  assert.equal(result.bucket,'walk');assert.equal(result.needsLookup,true);assert.equal(result.deadline,'2026-10-31');assert.equal(result.chain,'synthetic');assert.equal(flyer.deadline,null);
  const blank=finalizeFlyer(mergeFallback([page('blank',{})]),'2026-10-11');assert.equal(blank.deadline,null);assert.equal(blank.chain,null);
  const lesson=finalizeFlyer(mergeFallback([page('pc',{business:{name:'パソコン教室トップ'},category:'lesson'})]),'2026-10-11',matchChain);assert.equal(lesson.chain,null);
});
test('storable removes all personal text fields and preserves other flyers',()=>{
  const personal=finalizeFlyer(mergeFallback([page('mail',{category:'official_or_personal',business:{name:'テスト連絡室'},summary_en:'Private notice',address:'東京都テスト区1-2-3',offers:[{text_ja:'テスト通知'}]})]),'2026-10-11');
  const stored=storable(personal);
  assert.deepEqual(stored,{id:'f-mail',pageIds:['mail'],bucket:'keep',category:'official_or_personal'});
  assert.doesNotMatch(JSON.stringify(stored),/business|offers|address|テスト|Private/);
  const ordinary=finalizeFlyer(mergeFallback([page('shop',{category:'shop'})]),'2026-10-11');assert.equal(storable(ordinary),ordinary);
});
test('printedValue uses only printed savings in the specified priority',()=>{
  const entries=[{kind:'free_trial',regular_yen:3300,offer_yen:0},{regular_yen:198,price_yen:158},{discount_yen:500},{regular_yen:1000,percent_off:20},{text_ja:'特別価格'}];
  assert.deepEqual(entries.map(printedValue),[3300,40,500,200,null]);
  assert.deepEqual(savings(entries.map(entry=>({entry}))),{yen:4040,counted:4,uncounted:1});
  assert.equal(printedValue({kind:'free_trial',regular_yen:3300}),3300);
  assert.equal(printedValue({regular_yen:1000,offer_yen:800,price_yen:700,discount_yen:500,percent_off:50}),200);
  assert.equal(printedValue({regular_yen:1000,offer_yen:1200,discount_yen:500,percent_off:50}),500);
  assert.equal(printedValue({regular_yen:999,percent_off:12.5}),125);
  assert.equal(printedValue({regular_yen:100,price_yen:120}),null);
  assert.equal(printedValue({discount_yen:-500}),null);assert.equal(printedValue(null),null);
  assert.deepEqual(savings([{entry:{discount_yen:0}},{}]),{yen:0,counted:1,uncounted:1});assert.deepEqual(savings([]),{yen:0,counted:0,uncounted:0});
});
test('matchChain covers all named chains and NFKC forms',()=>{
  for(const [name,chain] of Object.entries(CHAINS))assert.equal(matchChain(name),chain,name);
  assert.equal(matchChain('ＯＫ'),'ok');assert.equal(matchChain('まいばすけっと 高津店'),'mybasket');assert.equal(matchChain('seiyu テスト支店'),'seiyu');
  for(const name of [null,'','テスト青空店','BOOK TEST','FUJITA TEST','オケテスト店'])assert.equal(matchChain(name),null);
});
test('matchBranch requires the same chain and a nonempty normalized branch',()=>{
  const stores=[{branchId:'wrong-chain',chain:'another',ja:'テスト青空店 高津店'},{branchId:'right-chain',chain:'synthetic',ja:'テスト青空店 高津店'},{branchId:'other-branch',chain:'synthetic',ja:'テスト青空店 テスト支店'}];
  assert.equal(matchBranch({chain:'synthetic',business:{branch:' 高津・店 '}},stores),'right-chain');
  assert.equal(matchBranch({chain:'synthetic',business:{branch:'不存在店'}},stores),null);
  assert.equal(matchBranch({chain:'synthetic',business:{branch:''}},stores),null);
  assert.equal(matchBranch({chain:null,business:{branch:'高津店'}},stores),null);
});
test('featureRow emits the specified buckets and no flyer strings',()=>{
  const flyer={...tile({category:'lesson',business:{name:'テスト教室'},address:'東京都テスト区1-2-3',comes_to_you:true,delivery:true,offers:[{kind:'coupon',discount_yen:500},{kind:'free_trial',regular_yen:3300,offer_yen:0}],items:[{name_ja:'テスト茶',price_yen:158,regular_yen:198}]}),deadline:'2026-10-14'};
  const row=featureRow(flyer,{distanceMeters:499,today:'2026-10-11'});
  assert.deepEqual(row,[0,0,2,1,3,1,1,1,1]);assert.equal(row.length,FEATURES.length);
  assert.ok(row.every(Number.isFinite));assert.match(JSON.stringify(row),/^\[[\d,\-]+\]$/);assert.doesNotMatch(JSON.stringify(row),/[a-z]/i);
  for(const [distanceMeters,expected] of [[0,0],[499,0],[500,1],[999,1],[1000,2],[1999,2],[2000,3],[null,3],[NaN,3]])assert.equal(featureRow(flyer,{distanceMeters,today:'2026-10-11'})[1],expected);
  for(const [deadline,expected] of [[null,0],['2026-10-10',-1],['2026-10-11',1],['2026-10-14',1],['2026-10-15',2],['2026-10-25',2],['2026-10-26',3],['2026-11-30',3]])assert.equal(featureRow({...flyer,deadline},{today:'2026-10-11'})[5],expected);
  for(const [discount_yen,expected] of [[null,0],[0,1],[1,1],[499,1],[500,2],[1999,2],[2000,3]])assert.equal(featureRow({...tile({offers:[{discount_yen}]})},{today:'2026-10-11'})[4],expected);
  assert.deepEqual(featureRow(tile({}),{today:'2026-10-11'}),[14,3,-1,0,0,0,0,0,0]);
  assert.equal(featureRow({...tile({items:[{name_ja:'テスト茶',regular_yen:1000,price_yen:100}]})},{today:'2026-10-11'})[4],2);
  assert.equal(featureRow({...flyer,deadline:'2026-02-30'},{today:'2026-10-11'})[5],0);
  assert.equal(featureRow({...flyer,deadline:'2027-01-01'},{today:'2026-12-31'})[5],1);
});
