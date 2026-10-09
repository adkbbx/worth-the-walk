// One-time, explicit review migration. Fails rather than silently missing a target.
import {readFile,writeFile} from 'node:fs/promises';
async function replace(path,pairs){let text=await readFile(path,'utf8');for(const [from,to] of pairs){if(!text.includes(from))throw new Error(`Missing target in ${path}: ${from}`);text=text.replace(from,to);}await writeFile(path,text);}
await replace('dist/app.mjs',[
  ['<article class="store" aria-labelledby=', '<article class="store" data-walk="${s.walk===null?\'unknown\':\'known\'}" aria-labelledby='],
  ['<summary>Sources &amp; checkout details</summary>', '<summary>Sources &amp; checkout details<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>'],
  ['Directions ↗</a>', 'Directions</a>'],
  ["let wallet=[];let selected='koenji';let date=japanToday();", "let wallet=[];let selected='koenji';let date=japanToday();\nconst mobile=matchMedia('(max-width:680px)');\nfunction syncLayout(){ $('options').open=!mobile.matches; }\nmobile.addEventListener('change',syncLayout);syncLayout();\nfunction showResults(){if(mobile.matches){$('options').open=false;$('results').focus({preventScroll:true});$('results').scrollIntoView({behavior:'instant',block:'start'});}}\n$('apply-options').addEventListener('click',showResults);"],
  ["const station=stations.find(s=>s.id===selected);", "const station=stations.find(s=>s.id===selected);\n  $('options-summary').innerHTML=`<span>Point cards &amp; visit date<small>${wallet.length?wallet.length+' selected':'All cards'} · ${fmt(date)}</small></span>`;"],
  ["$('visit-date').value=date;render();});", "$('visit-date').value=date;render();showResults();});"]
]);
await replace('dist/styles.css',[
  ["Schibsted,'Yu Gothic',Meiryo,sans-serif", "Schibsted,'Zen Kaku Gothic New','Yu Gothic',Meiryo,sans-serif"],
  [".store details summary::after{content:'+';margin-left:auto;font-size:18px}", ""],
  [".store details[open] summary::after{content:'−'}", ""]
]);
console.log('Applied source-level review fixes.');
