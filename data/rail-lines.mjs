// Ordered station names checked against the linked operators on 2026-10-09.
// Branches are explicit; this is station coverage, not verified shop coverage.
export const railLines = [
  {id:'pilot',name:'JR Chūō / Sōbu · existing pilot',ja:'中央・総武線',source:'https://www.jreast.co.jp/map/'},
  {id:'nambu',name:'JR Nambu Line',ja:'JR南武線',source:'https://www.jreast.co.jp/equipment/equipment_1/wheelchair/pdf/wheelchair_seibi_nanbu.pdf'},
  {id:'nambu-branch',name:'JR Nambu branch · Shitte–Hama-Kawasaki',ja:'南武支線',source:'https://timetables.jreast.co.jp/2610/train/045/045661.html'},
  {id:'den-en-toshi',name:'Tokyu Den-en-toshi Line',ja:'東急田園都市線',source:'https://www.tokyu.co.jp/railway/dt/'},
  {id:'skytree',name:'Tobu Skytree Line · through Takenotsuka',ja:'東武スカイツリーライン',source:'https://www.tobu.co.jp/railway/guide/line/isesaki_line.html'}
];
const nambu = [
  ['kawasaki','Kawasaki','川崎'],['shitte','Shitte','尻手'],['yako','Yako','矢向'],['kashimada','Kashimada','鹿島田'],['hirama','Hirama','平間'],['mukaigawara','Mukaigawara','向河原'],['musashi-kosugi','Musashi-Kosugi','武蔵小杉'],['musashi-nakahara','Musashi-Nakahara','武蔵中原'],['musashi-shinjo','Musashi-Shinjo','武蔵新城'],['musashi-mizonokuchi','Musashi-Mizonokuchi','武蔵溝ノ口'],['tsudayama','Tsudayama','津田山'],['kuji','Kuji','久地'],['shukugawara','Shukugawara','宿河原'],['noborito','Noborito','登戸'],['nakanoshima','Nakanoshima','中野島'],['inadazutsumi','Inadazutsumi','稲田堤'],['yanokuchi','Yanokuchi','矢野口'],['inagi-naganuma','Inagi-Naganuma','稲城長沼'],['minami-tama','Minami-Tama','南多摩'],['fuchu-hommachi','Fuchu-Hommachi','府中本町'],['bubaigawara','Bubaigawara','分倍河原'],['nishifu','Nishifu','西府'],['yaho','Yaho','谷保'],['yagawa','Yagawa','矢川'],['nishi-kunitachi','Nishi-Kunitachi','西国立'],['tachikawa','Tachikawa','立川']
];
const branch = [['hatcho-nawate','Hatcho-Nawate','八丁畷'],['kawasaki-shinmachi','Kawasaki-Shinmachi','川崎新町'],['odasakae','Odasakae','小田栄'],['hama-kawasaki','Hama-Kawasaki','浜川崎']];
const denEnToshi = [
  ['shibuya','Shibuya','渋谷'],['ikejiri-ohashi','Ikejiri-Ohashi','池尻大橋'],['sangen-jaya','Sangen-jaya','三軒茶屋'],['komazawa-daigaku','Komazawa-daigaku','駒沢大学'],['sakura-shimmachi','Sakura-shimmachi','桜新町'],['yoga','Yoga','用賀'],['futako-tamagawa','Futako-Tamagawa','二子玉川'],['futako-shinchi','Futako-Shinchi','二子新地'],['takatsu','Takatsu','高津'],['mizonokuchi','Mizonokuchi','溝の口'],['kajigaya','Kajigaya','梶が谷'],['miyazakidai','Miyazakidai','宮崎台'],['miyamaedaira','Miyamaedaira','宮前平'],['saginuma','Saginuma','鷺沼'],['tama-plaza','Tama-Plaza','たまプラーザ'],['azamino','Azamino','あざみ野'],['eda','Eda','江田'],['ichigao','Ichigao','市が尾'],['fujigaoka','Fujigaoka','藤が丘'],['aobadai','Aobadai','青葉台'],['tana','Tana','田奈'],['nagatsuta','Nagatsuta','長津田'],['tsukushino','Tsukushino','つくし野'],['suzukakedai','Suzukakedai','すずかけ台'],['minami-machida','Minami-Machida Grandberry Park','南町田グランベリーパーク'],['tsukimino','Tsukimino','つきみ野'],['chuo-rinkan','Chuo-Rinkan','中央林間']
];
const skytree = [
  ['asakusa','Asakusa','浅草'],['tokyo-skytree','Tokyo Skytree','とうきょうスカイツリー'],['oshiage','Oshiage (Skytree)','押上〈スカイツリー前〉'],['hikifune','Hikifune','曳舟'],['higashi-mukojima','Higashi-Mukojima','東向島'],['kanegafuchi','Kanegafuchi','鐘ヶ淵'],['horikiri','Horikiri','堀切'],['ushida','Ushida','牛田'],['kita-senju','Kita-Senju','北千住'],['kosuge','Kosuge','小菅'],['gotanno','Gotanno','五反野'],['umejima','Umejima','梅島'],['nishi-arai','Nishi-Arai','西新井'],['takenotsuka','Takenotsuka','竹ノ塚']
];
function stationRows(rows,lineId,prefix,start,regionFor) {
  const line=railLines.find(l=>l.id===lineId);
  return rows.map(([id,name,ja],i)=>({id,name,ja,code:`${prefix} ${String(i+start).padStart(2,'0')}`,lineId,line:line.name,region:regionFor(i),description:'Shop coverage being researched',source:line.source}));
}
export const additionalStations = [
  ...stationRows(nambu,'nambu','JN',1,i=>i<16?'神奈川県':'東京都').map(s=>s.id==='shitte'?{...s,lineIds:['nambu','nambu-branch']}:s),
  ...stationRows(branch,'nambu-branch','JN',51,()=> '神奈川県'),
  ...stationRows(denEnToshi,'den-en-toshi','DT',1,i=>i<7||(i>=22&&i<=24)?'東京都':'神奈川県'),
  ...stationRows(skytree,'skytree','TS',1,()=> '東京都')
];
export function stationsOnLine(stations,lineId){
  const list=stations.filter(s=>(s.lineIds||[s.lineId]).includes(lineId));
  return lineId==='nambu-branch'?list.sort((a,b)=>a.id==='shitte'?-1:b.id==='shitte'?1:a.code.localeCompare(b.code)):list;
}
