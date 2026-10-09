import json
from source_cache import ROOT
from data_math import distance
stations=json.loads((ROOT/'data/station-coordinates.json').read_text(encoding='utf-8'))
branches=sum([json.loads(p.read_text(encoding='utf-8')) for p in (ROOT/'data').glob('branches-*.json') if p.name!='branches-all.json'],[])
for s in stations:
 nearby=[b for b in branches if (b.get('lat') and distance(s,b)<=2500) or s['id'] in b.get('stationIds',[])]
 close=[b for b in nearby if not b.get('lat') or distance(s,b)<=1500]
 if len(close)<5:print(s['id'],s['ja'],'1500m:',len(close),'2500m:',len(nearby))
print('Branches',len(branches))
