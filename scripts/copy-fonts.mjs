// One-time vendor import. Build uses committed font files, without this dependency.
import {readFile,copyFile,writeFile} from 'node:fs/promises';
const source='../node_modules/@fontsource/zen-kaku-gothic-new';
let css=await readFile(`${source}/400.css`,'utf8');
const names=[...css.matchAll(/url\(\.\/files\/([^)]*\.woff2)\)/g)].map(m=>m[1]);
for(const name of names)await copyFile(`${source}/files/${name}`,`dist/fonts/${name}`);
css=css.replace(/, url\(\.\/files\/[^)]*\.woff\) format\('woff'\)/g,'').replaceAll('./files/','./');
await writeFile('dist/fonts/zen.css',css);
await copyFile(`${source}/LICENSE`,'dist/fonts/Zen-OFL.txt');
console.log(`Vendored ${names.length} Japanese font subsets with OFL.`);
