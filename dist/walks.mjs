export const WALK_M_PER_MIN = 80;
export const DETOUR = 1.3;
export const HOLIDAYS = ['2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29'];
export function distanceMeters(a,b) {
  const rad=Math.PI/180, lat=(b.lat-a.lat)*rad, lon=(b.lon-a.lon)*rad;
  const h=Math.sin(lat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(lon/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function walkMinutes(meters) {
  return Math.round(meters*DETOUR/WALK_M_PER_MIN);
}
export function estimates(meters,weightKg=60) {
  const routeMeters=Math.round(meters*DETOUR), minutes=walkMinutes(meters);
  return {routeMeters,minutes,steps:Math.round(routeMeters/0.7),kcal:Math.round(3.5*weightKg*minutes/60)};
}
export function dayType(date) {
  const day=new Date(date+'T00:00:00Z').getUTCDay();
  return day===0||day===6||HOLIDAYS.includes(date)?'weekend':'weekday';
}
function range(open,close) {
  return [open,close<=open?close+1440:close];
}
function timeMinutes(time) {
  const parts=time.split(':');
  return +parts[0]*60+(+parts[1]);
}
function readRanges(text) {
  return [...text.matchAll(/(\d{1,2}):([0-5]\d)\s*-\s*(\d{1,2}):([0-5]\d)/g)].map(m=>range(+m[1]*60+(+m[2]),+m[3]*60+(+m[4])));
}
export function parseHours(text) {
  if(typeof text!=='string')return null;
  text=text.replace(/[０-９]/g,c=>'0123456789'[c.charCodeAt(0)-65296]).replace(/：/g,':').replace(/[–‐－〜～~]/g,'-');
  if(/24\s*hours|24時間/i.test(text))return {all:[[0,1440]]};
  const labels=[...text.matchAll(/平日|土日祝日?/g)], result={};
  if(labels.some(m=>m[0]==='平日')&&labels.some(m=>m[0].startsWith('土日祝'))) {
    for(let i=0;i<labels.length;i++) {
      const ranges=readRanges(text.slice(labels[i].index+labels[i][0].length,labels[i+1]?.index));
      const key=labels[i][0]==='平日'?'weekday':'weekend';
      if(ranges.length)result[key]=[...(result[key]||[]),...ranges];
    }
    return result.weekday||result.weekend?result:null;
  }
  const all=readRanges(text);
  if(!all.length)return null;
  const override=text.match(/[（(][^）)]*(?:土曜|日曜|祝日|土日)[^）)]*は\s*(\d{1,2}:[0-5]\d)\s*閉店[^）)]*[）)]/);
  return override?{all,weekend:all.map(([open])=>range(open,timeMinutes(override[1])))}:{all};
}
function dailyRanges(store,date) {
  const name=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date(date+'T00:00:00Z').getUTCDay()];
  const rows=(store.hoursByDay||[]).filter(row=>row.name===name);
  if(rows.length)return rows.map(row=>range(timeMinutes(row.openTime),timeMinutes(row.closeTime)));
  const hours=parseHours(store.hours);
  return hours?(hours[dayType(date)]||hours.all||[]):null;
}
export function openStatus(store,date,minute) {
  const today=dailyRanges(store,date);
  const previous=new Date(date+'T00:00:00Z');
  previous.setUTCDate(previous.getUTCDate()-1);
  const yesterday=dailyRanges(store,previous.toISOString().slice(0,10));
  if(today?.some(([open,close])=>minute>=open&&minute<close)||yesterday?.some(([open,close])=>minute+1440>=open&&minute+1440<close))return 'open';
  return today===null?'unknown':'closed';
}
export function neighbours(stations,stationsOnLine,stationId,steps=1) {
  const station=stations.find(s=>s.id===stationId), result=[];
  if(!station)return result;
  for(const lineId of station.lineIds||[station.lineId]) {
    if(lineId==='pilot')continue;
    const line=stationsOnLine(stations,lineId), index=line.findIndex(s=>s.id===stationId);
    if(index<0)continue;
    for(const s of [line[index-steps],line[index+steps]]) {
      if(s&&s.id!==stationId&&!result.some(row=>row.station.id===s.id))result.push({station:s,lineId});
    }
  }
  return result;
}
export function orderStops(start,end,stops) {
  let best=[], meters=1/0;
  if(stops.length<=6) {
    function visit(point,remaining,ordered,total) {
      if(!remaining.length) {
        const distance=total+distanceMeters(point,end);
        if(distance<meters) {best=ordered;meters=distance;}
        return;
      }
      for(let i=0;i<remaining.length;i++)visit(remaining[i],remaining.filter((s,j)=>j!==i),[...ordered,remaining[i]],total+distanceMeters(point,remaining[i]));
    }
    visit(start,stops,[],0);
  } else {
    const remaining=[...stops];
    let point=start;
    meters=0;
    while(remaining.length) {
      let index=0;
      for(let i=1;i<remaining.length;i++)if(distanceMeters(point,remaining[i])<distanceMeters(point,remaining[index]))index=i;
      const next=remaining.splice(index,1)[0];
      meters+=distanceMeters(point,next);best.push(next);point=next;
    }
    meters+=distanceMeters(point,end);
  }
  return {stops:best,meters};
}
export function planOuting({start,end,stops,maxMinutes}) {
  const kept=[...stops], dropped=[];
  let ordered=orderStops(start,end,kept);
  while(walkMinutes(ordered.meters)>maxMinutes&&kept.length) {
    dropped.push(kept.pop());ordered=orderStops(start,end,kept);
  }
  return {start,end,...ordered,dropped,minutes:walkMinutes(ordered.meters),estimates:estimates(ordered.meters)};
}
function mapPoint(point) {
  return encodeURIComponent(point.query??`${point.lat.toFixed(6)},${point.lon.toFixed(6)}`);
}
export function mapsLink(origin,waypoints,destination) {
  const via=waypoints.slice(0,3).map(mapPoint).join('%7C');
  return `https://www.google.com/maps/dir/?api=1&origin=${mapPoint(origin)}&destination=${mapPoint(destination)}&travelmode=walking`+(via?'&waypoints='+via:'');
}
export function groceryOnTheWay(route,stores,maxDetour=300) {
  const seen=[], result=[];
  for(const store of stores) {
    if(typeof store.lat!=='number'||typeof store.lon!=='number'||!(Math.abs(store.lat)<1/0)||!(Math.abs(store.lon)<1/0)||seen.includes(store.branchId))continue;
    seen.push(store.branchId);
    let detour=1/0, segment=-1;
    for(let i=0;i<route.length-1;i++) {
      const extra=distanceMeters(route[i],store)+distanceMeters(store,route[i+1])-distanceMeters(route[i],route[i+1]);
      if(extra<detour) {detour=extra;segment=i;}
    }
    if(detour<=maxDetour)result.push({store,segment,detour});
  }
  return result.sort((a,b)=>a.detour-b.detour);
}
