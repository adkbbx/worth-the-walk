export const sources = {
  mybasket:'https://www.mybasket.co.jp/service/point/',
  mybasketFaq:'https://www.mybasket.co.jp/faq/',
  seiyu:'https://www.seiyu.co.jp/assets/images/RakutenPoints_ServiceEnd_261001.pdf',
  tokyu:'https://www.tokyu-store.co.jp/contact/faq.html',
  ok:'https://ok-corporation.jp/feature/okclub.html',
  keio:'https://www.keiostore.co.jp/service/point.html'
};
export const stations = [
  {id:'koenji',name:'Koenji',ja:'高円寺',code:'JC 07',description:'North and south of the JR station',line:'JR Chūō / Sōbu'},
  {id:'ogikubo',name:'Ogikubo',ja:'荻窪',code:'JC 09',description:'Around the station and Minami-Ogikubo',line:'JR Chūō / Sōbu · Marunouchi'},
  {id:'kichijoji',name:'Kichijoji',ja:'吉祥寺',code:'JC 11',description:'Station food halls and local grocers',line:'JR Chūō / Sōbu · Inokashira'}
];
export const walletOptions = [
  {id:'rakuten',name:'Rakuten',ja:'楽天ポイント'},
  {id:'waon',name:'WAON POINT',ja:'WAON POINT'},
  {id:'tokyu',name:'TOKYU POINT',ja:'東急ポイント'},
  {id:'keio',name:'Keio',ja:'京王ポイント'},
  {id:'ok',name:'OK Club',ja:'オーケークラブ',note:'Discount membership'}
];
// Source-reviewed branch facts. null walk means no station walking time was verified.
export const stores = [
  {id:'tokyu-koenji',station:'koenji',chain:'tokyu',name:'Tokyu Store',ja:'東急ストア 高円寺店',address:'杉並区高円寺南4-48-1',hours:'07:00–01:00 (+1 day)',walk:1,access:'North exit',url:'https://www.tokyu-store.co.jp/shop/detail.html?pdid=15'},
  {id:'ok-koenji',station:'koenji',chain:'ok',name:'OK',ja:'オーケー 高円寺店',address:'杉並区高円寺南4-28-3',hours:'08:30–21:30',walk:3,access:'South exit',url:'https://ok-corporation.jp/shop/koenji.html'},
  {id:'seiyu-koenji',station:'koenji',chain:'seiyu',name:'SEIYU',ja:'西友 高円寺店',address:'杉並区高円寺南3-47-8',hours:'24 hours · grocery floors',walk:4,access:'South exit',url:'https://www.seiyu.co.jp/shop/西友高円寺店/'},
  {id:'mybasket-koenji-north',station:'koenji',chain:'mybasket',name:'My Basket · station north',ja:'まいばすけっと 高円寺駅北店',address:'杉並区高円寺北2-22-1',hours:'07:00–00:00',walk:3,access:'North side',url:'https://www.mybasket.co.jp/shop/detail/8155.html'},
  {id:'gyomu-koenji',station:'koenji',chain:'gyomu',name:'Gyomu Super',ja:'業務スーパー 高円寺店',address:'杉並区高円寺南4-6-5',hours:'09:00–21:00',walk:null,access:'South side · see directions',url:'https://gyomusuper.jp/shop/detail.php?sh_id=1035'},
  {id:'mybasket-koenji-3',station:'koenji',chain:'mybasket',name:'My Basket · Minami 3',ja:'まいばすけっと 高円寺南3丁目店',address:'杉並区高円寺南3-21-8',hours:'07:00–00:00',walk:null,access:'Toward Shin-Koenji · see directions',url:'https://www.mybasket.co.jp/shop/detail/7305.html'},
  {id:'mybasket-koenji-5',station:'koenji',chain:'mybasket',name:'My Basket · Minami 5',ja:'まいばすけっと 高円寺南5丁目店',address:'杉並区高円寺南5-41-1',hours:'07:00–23:00',walk:null,access:'Southwest side · see directions',url:'https://www.mybasket.co.jp/shop/'},
  {id:'seiyu-ogikubo',station:'ogikubo',chain:'seiyu',name:'SEIYU',ja:'西友 荻窪店',address:'杉並区上荻1-9-1 タウンセブン',hours:'24 hours · grocery floors',walk:3,access:'North exit',url:'https://www.seiyu.co.jp/shop/西友荻窪店/'},
  {id:'ok-ogikubo',station:'ogikubo',chain:'ok',name:'OK',ja:'オーケー 荻窪店',address:'杉並区南荻窪4-26-1',hours:'08:30–21:30',walk:8,access:'South exit',url:'https://ok-corporation.jp/shop/ogikubo.html'},
  {id:'mybasket-ogikubo-5',station:'ogikubo',chain:'mybasket',name:'My Basket · Ogikubo 5',ja:'まいばすけっと 荻窪5丁目店',address:'杉並区荻窪5-30-3',hours:'07:00–00:00',walk:3,access:'South side',url:'https://www.mybasket.co.jp/shop/detail/73474.html'},
  {id:'mybasket-ogikubo-4',station:'ogikubo',chain:'mybasket',name:'My Basket · Ogikubo 4',ja:'まいばすけっと 荻窪4丁目店',address:'杉並区荻窪4-31-1 NTT荻窪ビル',hours:'07:00–00:00',walk:3,access:'South side',url:'https://www.mybasket.co.jp/shop/detail/3897.html'},
  {id:'mybasket-ogikubo-south',station:'ogikubo',chain:'mybasket',name:'My Basket · station south',ja:'まいばすけっと 荻窪駅南店',address:'杉並区荻窪4-32-2',hours:'07:00–00:00',walk:5,access:'South side',url:'https://www.mybasket.co.jp/shop/detail/2661.html'},
  {id:'seiyu-kichijoji',station:'kichijoji',chain:'seiyu',name:'SEIYU',ja:'西友 吉祥寺店',address:'武蔵野市吉祥寺本町1-12-10',hours:'10:00–23:00 · grocery B1F',walk:5,access:'North exit',url:'https://www.seiyu.co.jp/shop/西友吉祥寺店/'},
  {id:'kinokuniya-kichijoji',station:'kichijoji',chain:'kinokuniya',name:'KINOKUNIYA',ja:'紀ノ国屋 吉祥寺店',address:'武蔵野市吉祥寺本町3-7-3',hours:'09:30–19:30',walk:null,access:'West of station · see directions',url:'https://www.e-kinokuniya.com/store/KINOKUNIYA/kichijoji'},
  {id:'miuraya-kichijoji',station:'kichijoji',chain:'miuraya',name:'Miuraya · Coppice',ja:'三浦屋 コピス吉祥寺店',address:'武蔵野市吉祥寺本町1-11-5 B1F',hours:'10:00–21:00',walk:null,access:'North side · Coppice B1F',url:'https://miuraya.com/store/copis/'},
  {id:'seijo-kichijoji',station:'kichijoji',chain:'seijo',name:'Seijo Ishii · Atre',ja:'成城石井 アトレ吉祥寺店',address:'武蔵野市吉祥寺南町1-1-24 東館1F',hours:'07:30–22:00',walk:1,access:'Atre east building',url:'https://shop.seijoishii.com/seijoishii/spot/detail?code=0104'},
  {id:'keio-kichijoji',station:'kichijoji',chain:'keio',name:'Kitchen Court',ja:'キッチンコート 吉祥寺店',address:'武蔵野市吉祥寺南町2-1-25 B1F',hours:'10:00–22:30',walk:0,access:'Station-connected · Kirarina B1F',url:'https://www.keiostore.co.jp/business/store51.html'}
];
