import {stations,stores,walletOptions,sources,railLines,stationsOnLine} from './catalog.mjs';
import {SNAPSHOT,japanToday,nextBonus,programs,matches,orderStores,reward} from './rules.mjs';
const $=id=>document.getElementById(id);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Tokyo'}).format(new Date(date+'T12:00:00+09:00'));
let wallet=[];let selected='koenji';let date=japanToday();
const mobile=matchMedia('(max-width:680px)');
function syncLayout(){ $('options').open=!mobile.matches; }
mobile.addEventListener('change',syncLayout);syncLayout();
function showResults(){if(mobile.matches){$('options').open=false;$('results').focus({preventScroll:true});$('results').scrollIntoView({behavior:'instant',block:'start'});}}
$('apply-options').addEventListener('click',showResults);
if(date<'2026-10-01'||date>'2027-04-30')date=SNAPSHOT;
try{wallet=JSON.parse(localStorage.getItem('station-points-wallet')||'[]').filter(p=>walletOptions.some(x=>x.id===p));}catch{}
const params=new URLSearchParams(location.search);if(stations.some(s=>s.id===params.get('station')))selected=params.get('station');
let selectedLine=stations.find(s=>s.id===selected).lineId;
$('line').innerHTML=railLines.map(l=>`<option value="${l.id}">${escape(l.name)} · ${escape(l.ja)}</option>`).join('');
function stationOptions(){
  const list=stationsOnLine(stations,selectedLine);
  $('line').value=selectedLine;
  $('station').innerHTML=list.map(s=>`<option value="${s.id}">${escape(s.name)} · ${escape(s.ja)}</option>`).join('');
  $('station').value=selected;
}
stationOptions();$('visit-date').value=date;
$('coverage').textContent=`${stations.length} stations selectable · shop research incomplete`;
$('wallet').innerHTML=walletOptions.map(p=>`<label class="checkbox"><input type="checkbox" value="${p.id}" ${wallet.includes(p.id)?'checked':''}><span>${p.name}${p.note?`<small>${p.note}</small>`:''}</span></label>`).join('');
function lines(chain){
  if(chain==='life')return [
    ['Earn','d POINT / Ponta: 1 point per ¥200 before tax','Present one program before checkout. Cannot combine with LaCuCa or LC JCB. Life multipliers and bonus points do not apply.'],
    ['Spend','d POINT / Ponta: 1 point = ¥1','Point-paid amounts do not earn points. Product exclusions apply; in-store service only.'],
    ['Life card','LaCuCa accepted as an alternative','Own-program rates and campaign terms are not quoted here. Choose one program per checkout.'],
    ['Sale','Item prices not verified','Open the official branch page for current flyers.']
  ];
  if(chain==='welcia')return [
    ['Earn','V POINT: 1 / ¥200 · WAON POINT: 1 / ¥100 before tax','Base rates from the current official FAQ. Eligible card presentation, registration and product exclusions apply.'],
    ['Spend','Check current redemption conditions','V POINT is listed by the official partner directory; do not assume the same special-day benefit as WAON POINT.'],
    ['Sale','Item prices and special-day limits not verified','This is a drugstore. Food assortment varies; check the branch flyer before visiting.']
  ];
  if(chain==='mybasket')return [
    ['Earn',`${reward(chain,date)} WAON POINT / ¥200 incl. tax`, 'Eligible: AEON Pay, AEON card, electronic WAON, or point card + cash / eligible AEON vouchers. Other credit cards excluded.'],
    ['Spend','WAON POINT accepted','Membership registration required. Electronic WAON points need conversion first.'],
    ['Bonus',reward(chain,date)>1?`${reward(chain,date)}× points on ${fmt(date)}`:'Next: '+fmt(nextBonus(date).date), '20th / 30th: 5×. 5th / 15th / 25th: 2×. This is not AEON’s 5% discount; exclusions apply.']
  ];
  if(chain==='ok')return [
    ['Discount','Food price × 3/103 off before tax','OK Club + cash. Alcohol excluded. Credit card, e-money and QR payments do not qualify.'],
    ['Points','OK Club is a discount membership','No common loyalty-point program has been verified for this branch.'],
    ['Flyer',date>='2026-10-05'&&date<='2026-10-11'?'Advertised: 5–11 October 2026':'Current item prices not verified for this date', date>='2026-10-05'&&date<='2026-10-11'?'AJINOMOTO vegetable chūka-don topping, 200g × 2: ¥368 before tax; ¥358 with member + cash. Stock may vary.':'The checked flyer covers 5–11 October. Open the official flyer for newer information.']
  ];
  if(chain==='seiyu')return date<='2027-04-04'?[
    ['Earn','Rakuten: 1 point / ¥200 before tax','Present your Rakuten point card. Product and campaign exclusions may apply.'],
    ['Spend','Rakuten: 1 point = ¥1','Point-card earning and redemption continue through 4 April 2027.'],
    ['Notice','Rakuten service ends after 4 April 2027','Related promotions end separately, no later than 31 December 2026. Item sales are not verified here.']
  ]:[['Notice','Rakuten point-card service scheduled to have ended','The checked notice gives 4 April 2027 as the last day. Check the store for replacement programs.'],['Sale','Item prices not verified','Open the official branch page for the current flyer.']];
  if(chain==='tokyu')return [
    ['Earn','TOKYU POINT / Rakuten: 1 point per ¥200 before tax','Present the point card before checkout. Other credit-card payments can still earn. See source for combining cards.'],
    ['Spend','Redemption details not verified in this pilot','Check the official FAQ before relying on a point balance.'],
    ['Sale','Item prices not verified','See the branch’s official flyer.']
  ];
  if(chain==='keio')return [
    ['Earn','Keio / Rakuten: 1 point per ¥200 before tax','Present cards before paying. Non-Keio credit cards do not earn Keio points.'],
    ['Spend','Keio / Rakuten: 1 point = ¥1','Use one program per payment; Keio and Rakuten points cannot be redeemed together.'],
    ['Sale','Item prices not verified','Official page links to the flyer; check availability there.']
  ];
  return [['Points','Program support not yet verified','Payment logos do not establish loyalty-card earning or redemption.'],['Sale','Item prices not verified','Check the official branch page for notices and flyers.']];
}
function renderStore(s){
  const supported=programs(s.chain,date);
  const chips=supported.map(id=>`<span class="point-chip ${wallet.includes(id)?'owned':''}">${walletOptions.find(p=>p.id===id).name}${wallet.includes(id)?' · yours':''}</span>`).join('');
  const walk=s.walk===null?'See directions':s.walk===0?'Station-connected':`${s.walk} min walk`;
  const source=sources[s.chain];
  const origin=stations.find(x=>x.id===selected);
  const direction='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(origin.ja+'駅 '+origin.region+' '+origin.line)+'&destination='+encodeURIComponent(s.ja+' '+s.address)+'&travelmode=walking';
  return `<article class="store" data-walk="${s.walk===null?'unknown':'known'}" aria-labelledby="name-${s.id}"><div class="store-top"><div><h3 id="name-${s.id}">${escape(s.name)}</h3><p class="store-ja" lang="ja">${escape(s.ja)}</p></div><span class="walk">${walk}<small>${escape(s.access)}</small></span></div><div class="store-location"><span>${escape(s.hours)}</span><span lang="ja">${escape(s.address)}</span></div><div class="store-body">${chips?`<div class="points-row">${chips}</div>`:''}${lines(s.chain).map(([label,title,condition])=>`<div class="offer-line"><span class="offer-label">${label}</span><div><strong class="${label==='Discount'?'discount':''}">${escape(title)}</strong><span class="condition">${escape(condition)}</span></div></div>`).join('')}</div><details><summary>Sources &amp; checkout details<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="source-detail"><p>Checked ${fmt(SNAPSHOT)}. Branch facts and chain rules are separate sources. Special hours, exclusions and stock can change.</p><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">Official branch page</a>${source?`<a href="${escape(source)}" target="_blank" rel="noopener noreferrer">Point / membership rules</a>`:''}${s.chain==='mybasket'?`<a href="${sources.mybasketFaq}" target="_blank" rel="noopener noreferrer">Payment &amp; exclusions FAQ</a>`:''}<p>Blue labels identify your selected memberships, not a guarantee that your payment qualifies.</p></div></details><div class="store-bottom"><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">Store information</a><a href="${s.chain==='ok'?'https://ok-corporation.jp/flyer/':escape(s.url)}" target="_blank" rel="noopener noreferrer">Flyer / notices</a><a class="directions" href="${escape(direction)}" target="_blank" rel="noopener noreferrer" aria-label="Walking directions to ${escape(s.ja)}">Directions</a></div></article>`;
}
function render(){
  const station=stations.find(s=>s.id===selected);
  $('options-summary').innerHTML=`<span>Point cards &amp; visit date<small>${wallet.length?wallet.length+' selected':'All cards'} · ${fmt(date)}</small></span>`;
  $('station-name').innerHTML=`${station.name} <span lang="ja">${station.ja}</span>`;
  $('station-code').textContent=station.code;
  $('station-description').textContent=station.line+' · '+station.description;
  const all=stores.filter(s=>s.station===selected);
  const programList=walletOptions.filter(p=>p.url&&(!wallet.length||wallet.includes(p.id)));
  $('program-guide').innerHTML=programList.map(p=>`<p><a target="_blank" rel="noopener noreferrer" href="${escape(p.url)}">${escape(p.name)} · official guide</a><span>${escape(p.guide)}</span></p>`).join('')||'<p>Select a major point program to see its official guide.</p>';
  let list=orderStores(all,wallet,date);
  const only=$('only-matches').checked;
  if(only)list=list.filter(s=>matches(s,wallet,date));
  $('result-count').textContent=`${list.length} of ${all.length} researched shops${all.length<5?' · incomplete coverage':''}`;
  $('sort-label').textContent=wallet.length?'Your cards first, then published walk time':'Published walk times first';
  $('date-note').textContent=`Visit: ${fmt(date)} · Sources checked ${fmt(SNAPSHOT)}${date!==SNAPSHOT?' · Recurring dates projected from checked rules':''}`;
  const localSearch='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(station.ja+'駅 '+station.region+' スーパーマーケット');
  const coverageNote=all.length<5?`<div class="coverage-note"><strong>Shop research is incomplete here.</strong><p>${all.length?'These are the branches checked so far; this is not the full local selection.':'This station is available, but nearby branches and their point conditions have not been checked yet.'}</p><a href="${escape(localSearch)}" target="_blank" rel="noopener noreferrer">Look for supermarkets around this station</a> · <a href="${escape(station.source)}" target="_blank" rel="noopener noreferrer">Official line information</a></div>`:'';
  $('stores').innerHTML=coverageNote+(list.length?list.map(renderStore).join(''):all.length?`<div class="empty"><h3>${wallet.length?'No verified card matches here':'Choose a card to filter shops'}</h3><p>${wallet.length?'Other shops may support your points, but this pilot has not verified them. Check the point-program guide for official partners.':'Select memberships on the left, or show all researched shops.'}</p><button class="secondary" id="show-all">Show all shops</button></div>`:'');
  $('show-all')?.addEventListener('click',()=>{$('only-matches').checked=false;render();});
  const bonus=nextBonus(date);
  $('next-bonus').innerHTML=all.some(s=>s.chain==='mybasket')?`<div class="bonus-date">${fmt(bonus.date)}</div><p>My Basket · ${bonus.multiplier}× WAON POINT<br>Eligible payments; exclusions apply.</p><button type="button" id="use-bonus">Compare shops on this date</button>`:'<p>No recurring bonus date has been verified for the checked shops at this station.</p>';
  $('use-bonus')?.addEventListener('click',()=>{date=bonus.date;$('visit-date').value=date;render();showResults();});
}
$('line').addEventListener('change',e=>{selectedLine=e.target.value;selected=stationsOnLine(stations,selectedLine)[0].id;stationOptions();history.replaceState(null,'','?station='+selected);$('semantic-results').replaceChildren();render();});
$('station').addEventListener('change',e=>{selected=e.target.value;history.replaceState(null,'','?station='+selected);$('semantic-results').replaceChildren();render();});
$('wallet').addEventListener('change',()=>{wallet=[...$('wallet').querySelectorAll('input:checked')].map(n=>n.value);try{localStorage.setItem('station-points-wallet',JSON.stringify(wallet));}catch{}render();});
$('only-matches').addEventListener('change',render);
$('visit-date').addEventListener('change',e=>{if(e.target.validity.valid&&e.target.value){date=e.target.value;render();}});
render();
let extractor,index,metadata;
$('load-ai').addEventListener('click',async()=>{
  $('load-ai').disabled=true;$('ai-status').textContent='Loading the multilingual model. The first download can take a minute…';
  try{
    const [{pipeline,env}, vectors, manifest]=await Promise.all([import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'),fetch('/notice-index.json').then(r=>{if(!r.ok)throw new Error('Index unavailable');return r.json();}),fetch('/model.json').then(r=>r.json())]);
    env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
    index=vectors;metadata=manifest;
    extractor=await pipeline('feature-extraction',metadata.id,{dtype:'q8',revision:metadata.revision,device:'wasm',progress_callback:p=>{if(p.status==='progress'&&p.file.includes('onnx'))$('ai-status').textContent=`Downloading model: ${Math.round(p.progress)}%`;}});
    extractor.tokenizer.model_max_length=128;
    $('load-ai').hidden=true;$('semantic-form').hidden=false;$('ai-status').textContent='Ready. Search ranks notices; it does not confirm eligibility.';$('offer-query').focus();
  }catch(e){$('load-ai').disabled=false;$('load-ai').textContent='Retry semantic search';$('ai-status').textContent='Model download failed. Check your connection and retry. The store comparison still works.';console.warn('Semantic search unavailable',e);}
});
$('semantic-form').addEventListener('submit',async e=>{
  e.preventDefault();const query=$('offer-query').value.trim();if(!query||!extractor)return;
  const button=e.target.querySelector('button');button.disabled=true;$('ai-status').textContent='Finding relevant notices…';
  try{
    const output=await extractor(query,{pooling:'mean',normalize:true});const vector=Array.from(output.data);
    const chains=new Set(stores.filter(s=>s.station===selected).map(s=>s.chain));
    const scored=index.filter(n=>chains.has(n.chain)).map(n=>({...n,score:n.vector.reduce((sum,v,i)=>sum+v*vector[i],0)})).sort((a,b)=>b.score-a.score).slice(0,3);
    $('semantic-results').innerHTML=scored.map(n=>`<article><strong>${escape(n.title)}</strong><p>${escape(n.summary)}</p><a target="_blank" rel="noopener noreferrer" href="${escape(n.source)}">Read official notice</a><p><small>Semantic match ${n.score.toFixed(2)} · not a probability</small></p></article>`).join('');
    $('ai-status').textContent=scored.length?'Closest notices for this station. Review the source and dates before acting.':'No indexed notices for this station yet. Read the branch rules or official point-program guide.';
  }catch(e){$('ai-status').textContent='Search could not run. Try a shorter query or reload the page.';}finally{button.disabled=false;}
});
