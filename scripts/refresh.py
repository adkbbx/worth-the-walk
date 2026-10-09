"""One incremental refresh command. No deployment or external writes."""
import subprocess,sys,argparse,json
from datetime import datetime,timezone
from source_cache import ROOT
from refresh_data import write_json
parser=argparse.ArgumentParser();parser.add_argument('--offline',action='store_true');args=parser.parse_args()
offline=['--offline'] if args.offline else [];results=[]
for command in [[sys.executable,'scripts/refresh_data.py',*offline],[sys.executable,'scripts/refresh_offers.py',*offline],[sys.executable,'scripts/refresh_rules.py',*offline],['node','scripts/compile-research.mjs'],['node','scripts/build.mjs']]:
 result=subprocess.run(command,cwd=ROOT);results.append({'step':command[1],'exitCode':result.returncode})
write_json(ROOT/'data/refresh-health.json',{'attemptedAt':datetime.now(timezone.utc).isoformat(),'offline':args.offline,'steps':results,'ok':all(r['exitCode']==0 for r in results)})
subprocess.run(['node','scripts/build-status.mjs'],cwd=ROOT,check=True)
if not all(r['exitCode']==0 for r in results):raise SystemExit(1)
