"""Read linked public flyer metadata. Publication windows are not item sale windows."""
from datetime import datetime,timezone
from urllib.parse import urljoin,urlsplit
import json,re,html,argparse
from source_cache import SourceCache,ROOT
from refresh_data import text,shufoo_feed,write_json

def leaflet_dates(value):
 # Japanese date ranges omit repeated year/month; do not infer from a title's issue date.
 match=re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日(?:[〜～]((?:\d{4}年)?(?:\d{1,2}月)?\d{1,2}日))?',value)
 if not match:return None
 year,month,day=map(int,match.group(1,2,3));start=f'{year:04}-{month:02}-{day:02}'
 end=match[4]
 if not end:return start,start
 parts=re.fullmatch(r'(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日',end)
 end_year=int(parts[1] or year);end_month=int(parts[2] or month);end_day=int(parts[3])
 if not parts[1] and end_month<month:end_year+=1
 return start,f'{end_year:04}-{end_month:02}-{end_day:02}'

def tokubai(cache,branch):
 body,meta=cache.get(branch['flyerUrl']+'?count=4&type=spweb',ttl=86400)
 links=re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>',body,re.S)
 leaflets=[(urljoin(branch['flyerUrl'],html.unescape(url)),field) for url,field in links if 'leaflet_widget/click?' in url]
 if not leaflets:return []
 # One detail page contains dates for all leaflets; no need to fetch every image/page.
 detail,dm=cache.get(leaflets[0][0],ttl=86400)
 match=re.search(r"data-view-state='([^']+)'",detail)
 if not match:raise ValueError('Tokubai leaflet state missing: '+branch['branchId'])
 state=json.loads(html.unescape(match[1]));dates={str(row['id']):leaflet_dates(row['alt']) for row in state['leaflets']}
 out=[];seen=set()
 for url,block in leaflets:
  identity=re.search(r'[?&]id=(\d+)',url)[1];period=dates.get(identity)
  title_match=re.search(r"<div class='leaflet_title'>(.*?)</div>",block,re.S)
  title=text(title_match[1]) if title_match else 'Branch flyer'
  key=(title,period)
  if not period or key in seen:continue
  seen.add(key);out.append({'id':'tokubai-'+identity,'branchId':branch['branchId'],'kind':'flyer','title':title,'start':period[0],'end':period[1],'windowKind':'advertised','source':url,'checkedAt':dm['checkedAt'],'sourceHash':dm['sha256']})
 return out

def shufoo(cache,branch):
 feed=branch.get('flyerFeed')
 if not feed:
  body,bm=cache.get(branch['url'],ttl=7*86400);feed=shufoo_feed(body)
 if not feed:return []
 feed+='&referer='+urlsplit(branch['url']).hostname
 body,meta=cache.get(feed,ttl=86400);data=json.loads(body)
 shop=data[0].get('shop') if isinstance(data,list) and data else data.get('shop')
 if not shop:raise ValueError('Shufoo shop missing')
 if shop.get('mapLatitude') and shop.get('mapLongitude'):
  branch.update({'lat':float(shop['mapLatitude']),'lon':float(shop['mapLongitude']),'coordinatePrecision':'publisher-location','coordinateSource':feed})
 rows=shop.get('chirashis',{}).get('chirashi',[])
 if isinstance(rows,dict):rows=[rows]
 out=[]
 for row in rows:
  if not row.get('publishStartTime') or not row.get('publishEndTime'):continue
  # Publisher has explicitly hidden these windows on some flyers. They describe availability only.
  out.append({'id':'shufoo-'+row['id'],'branchId':branch['branchId'],'kind':'flyer','title':row['title'],'start':row['publishStartTime'][:10].replace('/','-'),'end':row['publishEndTime'][:10].replace('/','-'),'startsAt':row['publishStartTime'].replace('/','-').replace(' ','T')+'+09:00','endsAt':row['publishEndTime'].replace('/','-').replace(' ','T')+'+09:00','windowKind':'publication','source':row['flashUrl'].replace('http:','https:'),'checkedAt':meta['checkedAt'],'sourceHash':meta['sha256']})
 return out

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--offline',action='store_true');parser.add_argument('--force',action='store_true');args=parser.parse_args()
 cache=SourceCache(args.offline,args.force);out=[];errors=[]
 previous=json.loads((ROOT/'data/flyers.json').read_text(encoding='utf-8')) if (ROOT/'data/flyers.json').exists() else []
 for chain in ['life','tokyu','sanwa','fresco']:
  path=ROOT/'data'/f'branches-{chain}.json';branches=json.loads(path.read_text(encoding='utf-8'))
  for branch in branches:
   try:out.extend(tokubai(cache,branch) if 'widgets.tokubai.co.jp' in branch.get('flyerUrl','') else shufoo(cache,branch))
   except Exception as error:
    errors.append({'branchId':branch['branchId'],'error':str(error)})
    # Keep last good facts with their original check time; freshness gates handle ageing.
    out.extend(o for o in previous if o['branchId']==branch['branchId'])
  write_json(path,branches);print(chain,'flyers processed',flush=True)
 write_json(ROOT/'data/flyers.json',sorted(out,key=lambda o:(o['branchId'],o['id'])))
 write_json(ROOT/'data/offer-refresh-report.json',{'errors':errors,'flyers':len(out),'branches':len(set(o['branchId'] for o in out)),'sources':cache.events})
 print('Flyers:',len(out),'branches:',len(set(o['branchId'] for o in out)),'errors:',len(errors),flush=True)
 if errors:print(json.dumps(errors[:5],ensure_ascii=False),flush=True)
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
