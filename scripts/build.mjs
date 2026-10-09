import {mkdir,copyFile,access} from 'node:fs/promises';
import {stations,stores} from '../data/catalog.mjs';
for(const s of stations){const count=stores.filter(x=>x.station===s.id).length;if(count<5||count>10)throw new Error(`${s.id}: require 5–10 shops`);}
await mkdir('dist/fonts',{recursive:true});
await copyFile('src/rules.mjs','dist/rules.mjs');
await copyFile('data/catalog.mjs','dist/catalog.mjs');
await copyFile('data/model.json','dist/model.json');
await copyFile('data/notice-index.json','dist/notice-index.json');
// Committed fonts and their license keep the static build standalone.
for(const weight of [400,600])await access(`dist/fonts/schibsted-grotesk-latin-${weight}-normal.woff2`);
for(const name of ['index.html','app.mjs','styles.css','model.json','notice-index.json'])await access('dist/'+name);
console.log(`Static build ready: ${stores.length} stores, ${stations.length} stations.`);
