import math,re,unicodedata
def norm(value):
 return re.sub(r'[\s駅\-・（）()〈〉<>]','',unicodedata.normalize('NFKC',value)).replace('ヶ','ケ').replace('ノ','の')
def distance(a,b):
 lat1,lat2=map(math.radians,[a['lat'],b['lat']]);dl=lat2-lat1;dn=math.radians(b['lon']-a['lon'])
 return 6371000*2*math.asin(min(1,math.sqrt(math.sin(dl/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dn/2)**2)))
