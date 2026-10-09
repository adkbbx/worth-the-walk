"""Detect changed point terms. Human-reviewed summaries never auto-adopt changed terms."""
import json,re,hashlib,argparse
from source_cache import SourceCache,ROOT
from refresh_data import text,write_json
SOURCES={
 'life':['https://www.lifecorp.jp/service/point/index.html','https://www.lifecorp.jp/service/lacuca/'],
 'welcia':['https://welcia.tayori.com/q/yk-01/detail/1150044/','https://welcia.tayori.com/q/yk-01/detail/682253/'],
 'mybasket':['https://www.mybasket.co.jp/service/point/','https://www.mybasket.co.jp/faq/'],
 'ok':['https://ok-corporation.jp/feature/okclub.html'],
 'tokyu':['https://www.tokyu-store.co.jp/contact/faq.html'],
 'keio':['https://www.keiostore.co.jp/service/point.html'],
 'sanwa':['https://www.heartful-sanwa.co.jp/point'],
 'seiyu':['https://www.seiyu.co.jp/assets/images/RakutenPoints_ServiceEnd_261001.pdf'],
}
def fingerprint(body):
 body=re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1>','',body,flags=re.I)
 return hashlib.sha256(text(body).encode()).hexdigest()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--offline',action='store_true');parser.add_argument('--approve',action='append',choices=list(SOURCES),default=[]);args=parser.parse_args()
 cache=SourceCache(args.offline);path=ROOT/'data/rule-status.json'
 old=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {};out={}
 for chain,urls in SOURCES.items():
  previous=old.get(chain,{});sources=[]
  try:
   for url in urls:
    body,meta=cache.get(url,ttl=7*86400);sources.append({'url':url,'hash':fingerprint(body),'checkedAt':meta['checkedAt']})
   approved=previous.get('approvedHashes',[])
   hashes=[s['hash'] for s in sources]
   if chain in args.approve:approved=hashes
   out[chain]={'status':'verified' if approved==hashes else 'review-needed','approvedHashes':approved,'sources':sources,'checkedAt':min(s['checkedAt'] for s in sources)}
  except Exception as error:out[chain]={**previous,'status':'fetch-failed','error':str(error)}
 write_json(path,out);print('Point rules:',', '.join(k+': '+v['status'] for k,v in out.items()),flush=True)
 if any(s['status']=='fetch-failed' for s in out.values()):raise SystemExit(1)
if __name__=='__main__':main()
