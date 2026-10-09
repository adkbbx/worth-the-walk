"""Refresh public branch facts into a static, source-attributed snapshot."""
from pathlib import Path
from urllib.parse import urlencode,urljoin
from datetime import datetime,timezone
import json,re,sys,subprocess,html,unicodedata,math,argparse
from source_cache import SourceCache,ROOT
from data_math import distance,norm
def text(value):return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',value))).strip()
def next_data(body):
 match=re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',body)
 if not match:raise ValueError('Structured retailer data missing')
 return json.loads(match.group(1))['props']['pageProps']
def field(body,css):
 match=re.search(r'<[^>]+class="[^"]*\b'+re.escape(css)+r'\b[^"]*"[^>]*>(.*?)</[^>]+>',body,re.S)
 return text(match.group(1)) if match else ''
def station_coordinates(cache,stations):
 output=[];responses={}
 # HeartRails exposes the operator names as its route keys; station names stay from operators.
 routes={'nambu':'JR南武線','nambu-branch':'JR南武支線','den-en-toshi':'東急田園都市線','skytree':'東武伊勢崎線','pilot':'JR中央線'}
 for line,query in routes.items():
  url='https://express.heartrails.com/api/json?'+urlencode({'method':'getStations','line':query})
  body,meta=cache.get(url,ttl=30*86400);responses[line]=(json.loads(body).get('response',{}).get('station',[]),url,meta)
 for station in stations:
  rows,url,meta=responses[station['lineId']];wanted=norm(station['ja'].split('〈')[0])
  aliases={'武蔵溝の口':'武蔵溝ノ口','南町田グランベリーパーク':'南町田','とうきょうスカイツリー':'業平橋'}
  matched=[r for r in rows if norm(r['name'])==wanted or norm(r['name'])==norm(aliases.get(station['ja'],''))]
  if not matched and station['id']=='oshiage':
   url='https://express.heartrails.com/api/json?'+urlencode({'method':'getStations','name':'押上'});body,meta=cache.get(url,ttl=30*86400)
   matched=json.loads(body).get('response',{}).get('station',[])
  if not matched:raise ValueError('No station coordinates for '+station['id'])
  row=matched[0];output.append({**station,'lat':float(row['y']),'lon':float(row['x']),'coordinateSource':url,'coordinatesCheckedAt':meta['checkedAt']})
 return output
def near_any(shop,stations,radius=2500):return any(distance(s,shop)<=radius for s in stations)
def life_directory(cache,stations):
 result=[]
 for prefecture in ['東京都','神奈川県']:
  base='https://store.lifecorp.jp/'+prefecture+'/'
  first,meta=cache.get(base,ttl=7*86400);data=next_data(first)
  for page in range(1,int(data['maxPage'])+1):
   if page>1:
    body,meta=cache.get(base+'?page='+str(page),ttl=7*86400);data=next_data(body)
   for shop in data['shops']:
    if shop['brand']['name']!='ライフ' or '配送センター' in shop['nameKanji'] or shop.get('openStatus')!='IS_ALREADY_OPEN':continue
    point={'lat':float(shop['latitude']),'lon':float(shop['longitude'])}
    if not near_any(point,stations):continue
    url='https://store.lifecorp.jp/detail/'+shop['storeCode']+'/'
    body,detail_meta=cache.get(url,ttl=7*86400);detail=next_data(body)['shop']
    cms=detail.get('cmsItemValues',[]);flyer=None;access='';cards=[]
    for item in cms:
     content=item['content']
     if content.get('componentName')=='baseInfoAddress':access=content.get('remarks',{}).get('bottom','')
     if content.get('title')=='ポイントカード':cards=[p['text'] for p in content.get('checkBoxComposite',{}).get('items',[]) if p.get('checked')]
     if content.get('title')=='Webチラシ':
      raw=json.dumps(content,ensure_ascii=False);match=re.search(r'https://widgets\.tokubai\.co\.jp/(\d+)/leaflet_widget',raw)
      if match:flyer='https://widgets.tokubai.co.jp/'+match.group(1)+'/leaflet_widget'
    hours=detail.get('businessHours',[]);pairs=sorted(set(h.get('openTime','')[:5]+'–'+h.get('closeTime','')[:5] for h in hours))
    result.append({'branchId':'life-'+shop['storeCode'],'chain':'life','name':'Life','ja':detail['nameKanji'],'address':detail['address'],'hours':' / '.join(pairs) or 'See official hours','hoursByDay':hours,'lat':point['lat'],'lon':point['lon'],'url':url,'flyerUrl':flyer or url,'accessText':text(access),'verifiedPrograms':[p for label,p in [('d POINT','dpoint'),('Ponta','ponta'),('LaCuCa','lacuca')] if label in cards],'checkedAt':detail_meta['checkedAt'],'sourceHash':detail_meta['sha256'],'provenance':'official','category':'supermarket'})
 print('Life nearby branches:',len(result),flush=True);return result
def mybasket_directory(cache,stations):
 result=[];urls=set()
 body,meta=cache.get('https://www.mybasket.co.jp/shop/',ttl=7*86400)
 skips=[int(n) for n in re.findall(r'rt_bn_search_list_skip=(\d+)',body)];last=max(skips or [0])
 for skip in range(0,last+1,30):
  if skip:body,meta=cache.get('https://www.mybasket.co.jp/shop/?rt_bn_search_list_skip='+str(skip),ttl=7*86400)
  for block in re.findall(r'<li class="mod-shopList-item[^>]*>(.*?)</li>',body,re.S):
   link=re.search(r'href="(/shop/detail/\d+\.html)"',block)
   if not link:continue
   name=field(block,'rt_cf_s_tenpo_nm_kanji');address=field(block,'rt_cf_s_tenpo_jusho')
   # Only districts that contain requested stations or their immediately adjacent neighborhoods.
   areas=['川崎市','横浜市青葉区','横浜市都筑区','町田市','大和市','世田谷区','目黒区','渋谷区','墨田区','足立区','台東区','葛飾区','杉並区','武蔵野市','稲城市','府中市','国立市','立川市','調布市']
   if any(a in address for a in areas):urls.add(urljoin('https://www.mybasket.co.jp',link.group(1)))
 print('My Basket detail candidates:',len(urls),flush=True)
 for index,url in enumerate(sorted(urls)):
  body,meta=cache.get(url,ttl=7*86400)
  lat,lon=field(body,'rt_cf_s_tenpo_zahyo_hokui'),field(body,'rt_cf_s_tenpo_zahyo_tokei')
  if not lat or not lon:continue
  point={'lat':float(lat),'lon':float(lon)}
  if not near_any(point,stations):continue
  raw_hours=field(body,'rt_cf_s_kaiten_heiten_jikan');match=re.fullmatch(r'(\d{2})(\d{2})-(\d{2})(\d{2})',raw_hours)
  hours=f'{match[1]}:{match[2]}–{match[3]}:{match[4]}' if match else raw_hours or 'See official hours'
  name=field(body,'rt_cf_s_tenpo_nm_kanji');access=' '.join(field(body,'rt_cf_s_comment_'+str(i)) for i in range(1,4)).strip()
  result.append({'branchId':'mybasket-'+re.search(r'(\d+)\.html',url).group(1),'chain':'mybasket','name':'My Basket','ja':'まいばすけっと '+name+'店','address':field(body,'rt_cf_s_tenpo_jusho'),'hours':hours,**point,'url':url,'flyerUrl':url,'accessText':access,'verifiedPrograms':['waon'],'checkedAt':meta['checkedAt'],'sourceHash':meta['sha256'],'provenance':'official','category':'supermarket'})
  if index%100==0:print('My Basket details:',index+1,'/',len(urls),flush=True)
 print('My Basket nearby branches:',len(result),flush=True);return result
def ok_directory(cache,stations):
 result=[];seen=set()
 for prefecture in ['東京都','神奈川県']:
  base='https://ok-corporation.jp/shop/keyword/'+prefecture+'/'
  body,meta=cache.get(base,ttl=7*86400);last=max([int(p) for p in re.findall(r'/page/(\d+)/',body)] or [1])
  for page in range(1,last+1):
   if page>1:body,meta=cache.get(base+'page/'+str(page)+'/',ttl=7*86400)
   blocks=re.split(r'<div class="summary-shop-item">',body)[1:]
   for block in blocks:
    urlmatch=re.search(r'href="(https://ok-corporation\.jp/shop/[^"/]+\.html)"',block)
    coords=re.search(r'!2d([\d.]+)!3d([\d.]+)',block)
    if not urlmatch or not coords:continue
    url=urlmatch.group(1)
    if url in seen:continue
    seen.add(url);point={'lat':float(coords[2]),'lon':float(coords[1])}
    if not near_any(point,stations):continue
    detail,dm=cache.get(url,ttl=7*86400)
    marker=re.search(r'!8m2!3d([\d.]+)!4d([\d.]+)',detail)
    if marker:point={'lat':float(marker[1]),'lon':float(marker[2])}
    facts={text(k):text(v) for k,v in re.findall(r'<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>',detail,re.S)}
    name_match=re.search(r'<h1[^>]*>(.*?)</h1>',detail,re.S)
    if not facts.get('住所') or not name_match:raise ValueError('OK branch format changed: '+url)
    result.append({'branchId':'ok-'+url.split('/')[-1].split('.')[0],'chain':'ok','name':'OK','ja':text(name_match[1]),'address':facts['住所'],'hours':facts.get('営業時間（平日）',facts.get('営業時間','See official hours')),**point,'coordinatePrecision':'publisher-location' if marker else 'map-center','url':url,'flyerUrl':'https://ok-corporation.jp/flyer/','accessText':facts.get('アクセス',''),'verifiedPrograms':['ok'],'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256'],'provenance':'official','category':'supermarket'})
 print('OK nearby branches:',len(result),flush=True);return result
def tokyu_directory(cache,stations):
 result=[]
 body,meta=cache.get('https://www.tokyu-store.co.jp/shop/result.html',ttl=7*86400)
 urls=sorted(set(urljoin('https://www.tokyu-store.co.jp',u) for u in re.findall(r'href="(/shop/detail\.html\?pdid=\d+)"',body)))
 for url in urls:
  detail,dm=cache.get(url,ttl=7*86400)
  facts={text(k):text(v) for k,v in re.findall(r'<p><span>(.*?)</span><span>(.*?)</span></p>',detail,re.S)}
  access=facts.get('アクセス','');area_matches=[s for s in stations if re.search(r'(?:線|(?<![一-龯ぁ-んァ-ヶ]))'+re.escape(s['ja'].split('〈')[0])+r'駅',access)]
  if not area_matches:continue
  name_match=re.search(r'<h1[^>]*>(.*?)</h1>',detail,re.S)
  if not facts.get('住所') or not name_match:raise ValueError('Tokyu branch format changed: '+url)
  # No geocoding guess: only list at stations explicitly named by the official access text.
  hours=facts.get('営業時間','See official hours');hours=hours.split('サービスカウンター')[0].strip()
  branch_id='tokyu-'+re.search(r'pdid=(\d+)',url)[1]
  result.append({'branchId':branch_id,'chain':'tokyu','name':'Tokyu Store','ja':text(name_match[1]),'address':facts['住所'].replace(' 地図はこちら',''),'hours':hours[:180],'url':url,'flyerUrl':url,'accessText':access,'stationIds':[s['id'] for s in area_matches],'verifiedPrograms':['rakuten','tokyu'],'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256'],'provenance':'official','category':'supermarket'})
 print('Tokyu branches with official station access:',len(result),flush=True);return result
def write_json(path,data):
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)

def shufoo_feed(body):
 match=re.search(r'shopId\s*:\s*(\d+)[\s\S]{0,160}?un\s*:\s*["\']([^"\']+)',body)
 return 'https://asp.shufoo.net/api/shopDetailXML.php?'+urlencode({'un':match[2],'shopId':match[1],'responseFormat':'json','usedfor':'shufoo.asp.chirashilist'}) if match else None

def welcia_directory(cache,stations):
 result=[]
 for prefecture in ['13','14']:
  offset=0
  while True:
   url='https://store.welcia.co.jp/welcia/api/proxy2/shop/list?'+urlencode({'address':prefecture,'datum':'wgs84','limit':100,'offset':offset})
   body,meta=cache.get(url,ttl=7*86400);data=json.loads(body)
   for shop in data['items']:
    if not shop['name'].startswith('ウエルシア') or '調剤薬局' in shop['name'] or shop.get('status')!='normal' or not near_any(shop['coord'],stations):continue
    detail_url='https://store.welcia.co.jp/welcia/spot/detail?code='+shop['code']
    detail,dm=cache.get(detail_url,ttl=7*86400)
    retail=re.search(r'column-name-spot1[^>]*>\s*営業時間[\s\S]*?column-value-spot1[^>]*>([\s\S]*?)column-name-spot2',detail)
    hours=sorted(set(text(h) for h in re.findall(r'class="w_7_detail_4_1_business-hour-term"[^>]*>(.*?)</div>',retail[1] if retail else '',re.S)))
    # Opening tables include pharmacy hours too. Do not mistake those for retail hours.
    result.append({'branchId':'welcia-'+shop['code'],'chain':'welcia','name':'Welcia','ja':shop['name'],'address':shop['address_name'],'hours':(' / '.join(hours)+' · retail') if hours else 'See official retail hours',**shop['coord'],'url':detail_url,'flyerUrl':detail_url,'accessText':'Drugstore · food assortment varies','verifiedPrograms':['vpoint','waon'],'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256'],'provenance':'official','category':'drugstore'})
   offset+=100
   if offset>=data['count']['total']:break
 print('Welcia nearby branches:',len(result),flush=True);return result

def sanwa_directory(cache,stations):
 result=[];body,meta=cache.get('https://www.heartful-sanwa.co.jp/shop/',ttl=7*86400)
 urls=sorted(set(re.findall(r'https://www\.heartful-sanwa\.co\.jp/shop/\d+',body)))
 for url in urls:
  detail,dm=cache.get(url,ttl=7*86400);coords=re.search(r'!2d([\d.]+)!3d([\d.]+)',detail)
  if not coords:continue
  point={'lat':float(coords[2]),'lon':float(coords[1])}
  if not near_any(point,stations):continue
  facts={text(k):text(v) for k,v in re.findall(r'<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>',detail,re.S)}
  name=re.search(r'<h1[^>]*>(.*?)</h1>',detail,re.S)
  if not name or not facts.get('住所'):raise ValueError('Sanwa format changed: '+url)
  result.append({'branchId':'sanwa-'+url.split('/')[-1],'chain':'sanwa','name':'Sanwa / Food One','ja':text(name[1]),'address':facts['住所'],'hours':facts.get('営業時間','See official hours'),**point,'coordinatePrecision':'map-center','url':url,'flyerUrl':url,'flyerFeed':shufoo_feed(detail),'accessText':'Official map vicinity; approximate distance','verifiedPrograms':['sanwa'],'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256'],'provenance':'official','category':'supermarket'})
 print('Sanwa nearby branches:',len(result),flush=True);return result

def seiyu_directory(cache,stations):
 result=[];urls=set()
 for prefecture in ['tokyo','kanagawa']:
  body,meta=cache.get('https://www.seiyu.co.jp/searchshop/'+prefecture+'/',ttl=7*86400)
  urls.update(re.findall(r'href="(https://www\.seiyu\.co\.jp/shop/[^"\s]+/)"',body))
 for url in sorted(urls):
  detail,dm=cache.get(url,ttl=7*86400);coords=re.search(r'!8m2!3d([\d.]+)!4d([\d.]+)',detail)
  if not coords:continue
  point={'lat':float(coords[1]),'lon':float(coords[2])}
  if not near_any(point,stations):continue
  name=field(detail,'shop_heading_title_text');address=field(detail,'js-address')
  if not name or not address:raise ValueError('SEIYU format changed: '+url)
  branch=re.search(r'data-id="(\d+)" data-brand="seiyu"',detail)
  if not branch:continue
  # SEIYU food-floor hours and other floors differ; let the original floor guide resolve it.
  result.append({'branchId':'seiyu-'+branch[1],'chain':'seiyu','name':'SEIYU','ja':name,'address':address,'hours':'See official floor hours',**point,'url':url,'flyerUrl':url+'#flyer','accessText':'Check grocery-floor hours','verifiedPrograms':['rakuten'],'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256'],'provenance':'official','category':'supermarket'})
 print('SEIYU nearby branches:',len(result),flush=True);return result

def fuji_directory(cache,stations):
 result=[];body,meta=cache.get('https://www.fujicitio.com/tenpo/',ttl=7*86400)
 urls=sorted(set(urljoin('https://www.fujicitio.com/tenpo/',u) for u in re.findall(r'href="([^"\s]*shop_\d+\.html)"',body)))
 for url in urls:
  detail,dm=cache.get(url,ttl=7*86400);coords=re.search(r'!2d([\d.]+)!3d([\d.]+)',detail)
  if not coords:continue
  point={'lat':float(coords[2]),'lon':float(coords[1])}
  if not near_any(point,stations):continue
  facts={text(k):text(v) for k,v in re.findall(r'<td class="tenpo_shop_shosai_1"[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>',detail,re.S)}
  title=re.search(r'<title>(.*?)</title>',detail,re.S)
  if not facts.get('住所'):raise ValueError('FUJI format changed: '+url)
  title_name=re.split(r'店舗情報[・･]',text(title[1]))[-1].strip('～〜')
  result.append({'branchId':'fuji-'+re.search(r'shop_(\d+)',url)[1],'chain':'fuji','name':'FUJI','ja':'FUJI '+title_name,'address':facts['住所'],'hours':facts.get('営業時間','See official hours'),**point,'coordinatePrecision':'map-center','url':url,'flyerUrl':url,'accessText':facts.get('アクセス','Official map vicinity; approximate distance'),'verifiedPrograms':[],'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256'],'provenance':'official','category':'supermarket'})
 print('FUJI nearby branches:',len(result),flush=True);return result
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--offline',action='store_true');parser.add_argument('--force',action='store_true');parser.add_argument('--stage',choices=['stations','life','mybasket','ok','tokyu','welcia','sanwa','seiyu','fuji','all'],default='all');args=parser.parse_args()
 cache=SourceCache(args.offline,args.force)
 inputs=json.loads(subprocess.run(['node','scripts/export-refresh-input.mjs'],cwd=ROOT,check=True,capture_output=True,encoding='utf-8').stdout)
 station_path=ROOT/'data/station-coordinates.json'
 if args.stage in ['stations','all']:
  stations=station_coordinates(cache,inputs['stations']);write_json(station_path,stations);print('Station coordinates:',len(stations),flush=True)
 else:stations=json.loads(station_path.read_text(encoding='utf-8'))
 failures=[]
 adapters={'life':life_directory,'mybasket':mybasket_directory,'ok':ok_directory,'tokyu':tokyu_directory,'welcia':welcia_directory,'sanwa':sanwa_directory,'seiyu':seiyu_directory,'fuji':fuji_directory}
 for stage,adapter in adapters.items():
  if args.stage not in [stage,'all']:continue
  try:
   branches=adapter(cache,stations)
   if not branches:raise ValueError('Empty branch result; preserving previous snapshot')
   write_json(ROOT/'data'/('branches-'+stage+'.json'),branches)
  except Exception as error:
   failures.append({'chain':stage,'error':str(error)});print(stage,'failed; preserving prior snapshot:',str(error),flush=True)
 write_json(ROOT/'data'/('branch-refresh-report-'+args.stage+'.json'),{'errors':failures,'sources':cache.events})
 write_json(ROOT/'.source-cache'/('fetch-report-'+args.stage+'.json'),cache.events)
 if failures:raise SystemExit(1)
if __name__=='__main__':main()
