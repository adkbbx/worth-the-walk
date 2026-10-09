"""Prove cached refreshes do not make source facts newer or alter compiled data."""
import hashlib,subprocess,sys,json
from source_cache import ROOT
paths=['data/researched.mjs','data/flyers.json','data/rule-status.json','data/station-coordinates.json']
def hashes():return {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
before=hashes();subprocess.run([sys.executable,'scripts/refresh.py','--offline'],cwd=ROOT,check=True);after=hashes()
assert before==after,{p for p in paths if before[p]!=after[p]}
print('Cached replay passed: branch associations, flyers, rule checks and station coordinates unchanged.')
