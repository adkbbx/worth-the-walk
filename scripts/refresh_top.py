"""Refresh Top's official station-access branches; preserve unverified point rates."""
import json,re
from refresh_data import SourceCache,ROOT,text,write_json

def top_directory(cache,stations):
 body,_=cache.get('https://super-tops.com/',ttl=7*86400)
 urls=sorted(set(re.findall(r'https://super-tops\.com/shop/[^/"<>]+/',body)))
 result=[]
 for url in urls:
  detail,meta=cache.get(url,ttl=7*86400)
  access=' '.join(text(p) for p in re.findall(r'<p[^>]*>(.*?)</p>',detail,re.S) if '駅' in text(p) and '徒歩' in text(p))
  ids=[s['id'] for s in stations if re.search(r'(?:線|\s)'+re.escape(s['ja'].split('〈')[0])+r'駅',access)]
  if not ids:continue
  facts={text(k):text(v) for k,v in re.findall(r'<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>',detail,re.S)}
  title=re.search(r'<h1[^>]*>(.*?)</h1>',detail,re.S)
  if not title or not facts.get('住所'):raise ValueError('Top branch format changed: '+url)
  result.append({'branchId':'top-'+url.rstrip('/').split('/')[-1],'chain':'top','name':'Top / Parque / New Yahiro','ja':text(title[1]),'address':facts['住所'].replace('地図を見る','').strip(),'hours':facts.get('営業時間','See official hours'),'url':url,'flyerUrl':url,'stationIds':ids,'accessText':access,'verifiedPrograms':[],'checkedAt':meta['checkedAt'],'sourceHash':meta['sha256'],'provenance':'official','category':'supermarket','membershipNote':'Top CoGCa point card is listed on the official branch page. Rates and redemption conditions have not been verified; payment logos do not establish d POINT or PayPay rewards.'})
 return result

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--offline',action='store_true');args=parser.parse_args()
 cache=SourceCache(args.offline);stations=json.loads((ROOT/'data/station-coordinates.json').read_text(encoding='utf-8'))
 result=top_directory(cache,stations)
 if not result:raise ValueError('Empty Top result; preserving previous snapshot')
 write_json(ROOT/'data/branches-top.json',result)
 print('Top official-access branches:',len(result))
