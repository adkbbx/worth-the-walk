"""Polite conditional HTTP cache for public retailer/map data; no browser API calls."""
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlsplit,urlunsplit,quote
from urllib.error import HTTPError
from datetime import datetime,timezone
import hashlib,json,time
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.source-cache'
USER_AGENT='StationPoints/0.2 (+https://station-points-japan.agilecod1.chatgpt.site)'
class SourceCache:
 def __init__(self,offline=False,force=False):
  self.offline,self.force=offline,force;self.events=[];self.last={};CACHE.mkdir(exist_ok=True)
 def get(self,url,ttl=86400,post=None):
  parts=urlsplit(url);url=urlunsplit((parts.scheme,parts.netloc,quote(parts.path,safe='/%:@'),quote(parts.query,safe='=&%/:?+'),''))
  key=hashlib.sha256((url+(post or '')).encode()).hexdigest();path=CACHE/(key+'.body');meta_path=CACHE/(key+'.json')
  meta=json.loads(meta_path.read_text()) if meta_path.exists() else {};now=time.time()
  if path.exists() and (self.offline or (not self.force and now-meta.get('checkedEpoch',0)<ttl)):
   self.events.append({'url':url,'status':'cached','checkedAt':meta['checkedAt']});return path.read_text(encoding='utf-8'),meta
  if self.offline:raise RuntimeError('Offline cache miss: '+url)
  wait=max(0,0.35-(now-self.last.get(parts.netloc,0)))
  if wait:time.sleep(wait)
  self.last[parts.netloc]=time.time()
  headers={'User-Agent':USER_AGENT,'Accept':'application/json,text/html,*/*'}
  for header,field in [('If-None-Match','etag'),('If-Modified-Since','lastModified')]:
   if meta.get(field):headers[header]=meta[field]
  if post is not None:headers['Content-Type']='application/x-www-form-urlencoded'
  req=Request(url,data=post.encode() if post is not None else None,headers=headers)
  try:
   with urlopen(req,timeout=120) as response:
    raw=response.read();encoding=response.headers.get_content_charset() or 'utf-8'
    if encoding.lower() in ['windows-31j','shift_jis','shift-jis']:encoding='cp932'
    body=raw.decode(encoding,'replace')
    digest=hashlib.sha256(body.encode()).hexdigest();changed=digest!=meta.get('sha256')
    meta.update({'url':url,'etag':response.headers.get('ETag'),'lastModified':response.headers.get('Last-Modified'),'sha256':digest,'checkedAt':datetime.now(timezone.utc).isoformat(),'checkedEpoch':time.time(),'changed':changed})
    tmp=path.with_suffix('.tmp');tmp.write_text(body,encoding='utf-8');tmp.replace(path)
  except HTTPError as error:
   if error.code!=304 or not path.exists():raise
   body=path.read_text(encoding='utf-8');meta.update({'checkedAt':datetime.now(timezone.utc).isoformat(),'checkedEpoch':time.time(),'changed':False})
  tmp=meta_path.with_suffix('.meta.tmp');tmp.write_text(json.dumps(meta,ensure_ascii=False),encoding='utf-8');tmp.replace(meta_path)
  self.events.append({'url':url,'status':'changed' if meta['changed'] else 'unchanged','checkedAt':meta['checkedAt']})
  return body,meta
