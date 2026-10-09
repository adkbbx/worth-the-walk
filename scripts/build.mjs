import {mkdir,copyFile,access,writeFile} from 'node:fs/promises';
import {stations,stores,railLines,stationsOnLine,researchSummary} from '../data/catalog.mjs';
for(const s of stations){const count=stores.filter(x=>x.station===s.id).length;if(count===0)throw new Error(`${s.id}: missing researched shop coverage`);}
if(new Set(stations.map(s=>s.id)).size!==stations.length)throw new Error('Duplicate station IDs');
for(const store of stores)if(!stations.some(s=>s.id===store.station))throw new Error('Store references unknown station');
let coverage=`# Station coverage\n\n${stations.length} stations; ${researchSummary.branches} distinct source-linked branches. ${researchSummary.stationsWithFive} stations have at least five candidates within 2.5 km or with explicit official station access. The app displays up to ten, prioritized by selected cards and distance. This is a directory sample, not every shop. Straight-line distances are not walking-route distances. Shitte counts once.\n`;
for(const line of railLines){
  coverage+=`\n## ${line.name}\n\n[Official operator source](${line.source})\n\n| Code | Station | Japanese | Checked shop records |\n| --- | --- | --- | ---: |\n`;
  for(const s of stationsOnLine(stations,line.id))coverage+=`| ${s.code} | ${s.name} | ${s.ja} | ${stores.filter(x=>x.station===s.id).length} |\n`;
}
await writeFile('STATIONS.md',coverage);
await mkdir('dist/fonts',{recursive:true});
await copyFile('src/rules.mjs','dist/rules.mjs');
await copyFile('data/catalog.mjs','dist/catalog.mjs');
await copyFile('data/rail-lines.mjs','dist/rail-lines.mjs');
await copyFile('data/researched.mjs','dist/researched.mjs');
await copyFile('data/flyers.json','dist/flyers.json');
await copyFile('data/research-summary.json','dist/research-summary.json');
await copyFile('data/rule-status.json','dist/rule-status.json');
await copyFile('data/model.json','dist/model.json');
await copyFile('data/notice-index.json','dist/notice-index.json');
// Committed fonts and their license keep the static build standalone.
for(const weight of [400,600])await access(`dist/fonts/schibsted-grotesk-latin-${weight}-normal.woff2`);
for(const name of ['index.html','app.mjs','styles.css','model.json','notice-index.json'])await access('dist/'+name);
console.log(`Static build ready: ${stores.length} stores, ${stations.length} stations.`);
