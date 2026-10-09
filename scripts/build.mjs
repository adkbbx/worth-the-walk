import {mkdir,copyFile,access,writeFile} from 'node:fs/promises';
import {stations,stores,railLines,stationsOnLine} from '../data/catalog.mjs';
for(const s of stations){const count=stores.filter(x=>x.station===s.id).length;if(count>10||(s.lineId==='pilot'&&count<5))throw new Error(`${s.id}: invalid researched shop coverage`);}
if(new Set(stations.map(s=>s.id)).size!==stations.length)throw new Error('Duplicate station IDs');
for(const store of stores)if(!stations.some(s=>s.id===store.station))throw new Error('Store references unknown station');
let coverage='# Station coverage\n\n74 selectable stations. Station lists were checked against the linked operators on 9 October 2026. Shop research is incomplete; a zero means unresearched, not no shops nearby. Shitte appears in both route tables but counts once.\n';
for(const line of railLines){
  coverage+=`\n## ${line.name}\n\n[Official operator source](${line.source})\n\n| Code | Station | Japanese | Checked shop records |\n| --- | --- | --- | ---: |\n`;
  for(const s of stationsOnLine(stations,line.id))coverage+=`| ${s.code} | ${s.name} | ${s.ja} | ${stores.filter(x=>x.station===s.id).length} |\n`;
}
await writeFile('STATIONS.md',coverage);
await mkdir('dist/fonts',{recursive:true});
await copyFile('src/rules.mjs','dist/rules.mjs');
await copyFile('data/catalog.mjs','dist/catalog.mjs');
await copyFile('data/rail-lines.mjs','dist/rail-lines.mjs');
await copyFile('data/model.json','dist/model.json');
await copyFile('data/notice-index.json','dist/notice-index.json');
// Committed fonts and their license keep the static build standalone.
for(const weight of [400,600])await access(`dist/fonts/schibsted-grotesk-latin-${weight}-normal.woff2`);
for(const name of ['index.html','app.mjs','styles.css','model.json','notice-index.json'])await access('dist/'+name);
console.log(`Static build ready: ${stores.length} stores, ${stations.length} stations.`);
