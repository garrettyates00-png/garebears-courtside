/* League standings (Arena · Season): overall, West, East, with strength of schedule and record vs .500+ teams.
   Data: arena/standings.json, built by arena.py from ESPN standings plus every regular-season game. */
let STD=null,stView="all";
try{stView=localStorage.getItem("grindex-st-view")||"all"}catch(e){}
const stOrd=n=>n+(n%100>=11&&n%100<=13?"th":["th","st","nd","rd"][n%10]||"th");
const stPct=(w,l)=>w+l?w/(w+l):0;
const stP3=v=>v==null?"–":v.toFixed(3).replace(/^0/,"");
async function loadStandings(){
  try{const j=await (await fetch("arena/standings.json?t="+Date.now(),{cache:"no-store"})).json();if(STD&&j.pulled===STD.pulled)return;STD=j}
  catch(e){if(!STD){const el=$("#sStand");if(el)el.innerHTML='<div class="eyebrow">League</div><h2>Standings</h2><p class="mute">Standings are still being built. Check back in a few minutes.</p>'}return}
  renderStandings();
}
function renderStandings(){
  const el=$("#sStand");if(!el||!STD)return;
  const fav=(typeof getFav==="function"?getFav():"mem")||"mem";
  let rows=STD.teams.slice();
  if(stView!=="all")rows=rows.filter(r=>r.conf===(stView==="west"?"West":"East"));
  rows.sort((a,b)=>stPct(b.w,b.l)-stPct(a.w,a.l)||(a.seed||99)-(b.seed||99)||b.w-a.w);
  if(stView!=="all"&&rows.every(r=>r.seed))rows.sort((a,b)=>a.seed-b.seed);
  const top=rows[0]||{w:0,l:0},gb=r=>{const g=((top.w-r.w)+(r.l-top.l))/2;return g<=0?"–":g%1?g.toFixed(1):String(g)};
  const n=STD.teams.length,tier=k=>k<=Math.ceil(n/3)?"hard":k>n-Math.ceil(n/3)?"easy":"";
  const sosCell=(v,k)=>v==null?"<td>–</td>":`<td class="stsos ${tier(k)}" title="${stOrd(k)} toughest of ${n}">${stP3(v)}<small>${stOrd(k)}</small></td>`;
  const tabs=[["all","Overall"],["west","West"],["east","East"]];
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">League · updated ${esc(STD.pulled||"")}</div><h2>Standings</h2></div></div>
    <div class="bxtabs sttabs" role="tablist" aria-label="Standings view">${tabs.map(([k,l])=>`<button type="button" role="tab" data-st="${k}" aria-selected="${k===stView}">${l}</button>`).join("")}</div>
    <div class="tscroll"><table class="tbl sttbl"><thead><tr><th>#</th><th class="stteam">Team</th><th>W</th><th>L</th><th>Pct</th><th>GB</th>
      <th title="Opponents' win % in games played. 1st = toughest so far.">SOS played</th><th title="Opponents' win % in games still to play. 1st = toughest ahead.">SOS left</th><th title="Record against teams at .500 or better right now">vs .500+</th><th>L10</th><th>Strk</th></tr></thead><tbody>
    ${rows.map((r,i)=>{const k=i+1,cut=stView!=="all"&&(k===6||k===10)?" cut":"",v=r.v5||[0,0];
      return `<tr class="${r.abbr===fav?"mine":""}${cut}"><td class="strk">${k}</td>
      <td class="stteam"><span class="stnm">${r.logo?`<img src="${esc(r.logo)}" alt="" loading="lazy">`:""}<b>${esc(r.short||r.name)}</b>${stView==="all"?`<small>${esc(r.conf)}</small>`:""}</span></td>
      <td>${r.w}</td><td>${r.l}</td><td>${stP3(stPct(r.w,r.l))}</td><td>${gb(r)}</td>
      ${sosCell(r.sos,r.sosRk)}${sosCell(r.rem,r.remRk)}<td class="stv5">${v[0]}-${v[1]}</td><td>${esc(r.l10||"–")}</td>
      <td class="${/^W/.test(r.strk)?"up":/^L/.test(r.strk)?"down":""}">${esc(r.strk||"–")}</td></tr>`}).join("")}
    </tbody></table></div>
    <p class="faint stfoot">SOS is opponents' current win %; 1st means the toughest schedule in the league.${stView!=="all"?" Lines mark the top 6 (playoffs) and 7-10 (play-in).":""} vs .500+ counts games against teams at .500 or better today.</p>`;
  el.querySelectorAll("[data-st]").forEach(b=>b.onclick=()=>{stView=b.dataset.st;try{localStorage.setItem("grindex-st-view",stView)}catch(e){}renderStandings()});
}
(()=>{const pane=$("#aSeasonPane");if(!pane)return;
  const go=()=>{if(document.body.dataset.view==="arena"&&!pane.hidden)loadStandings()};
  new MutationObserver(go).observe(pane,{attributes:true,attributeFilter:["hidden"]});
  new MutationObserver(go).observe(document.body,{attributes:true,attributeFilter:["data-view"]});
  setInterval(()=>{if(!document.hidden)go()},300000);go()})();
