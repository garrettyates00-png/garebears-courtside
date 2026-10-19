/* Arena tab: deep live view of the favorite team. Shares $, esc, toast, reduce from the main script. */
let A=null, aTeam=null, aGame="all", aPlayer="all", aMetric="impact";
const ATK="courtside-team";
const getFav=()=>{try{return localStorage.getItem(ATK)||"mem"}catch(e){return "mem"}};
const setFav=v=>{try{localStorage.setItem(ATK,v)}catch(e){}};
const pct=v=>(v*100).toFixed(1)+"%";
const sign=v=>(v>0?"+":"")+v;
const ct=iso=>new Date(iso).toLocaleString("en-US",{timeZone:"America/Chicago",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const cday=iso=>new Date(iso).toLocaleDateString("en-US",{timeZone:"America/Chicago",month:"short",day:"numeric"});
const impl=ml=>{ml=+ml;if(!ml)return null;return ml<0?(-ml)/(-ml+100):100/(ml+100)};
const mlTxt=ml=>ml==null?"–":(ml>0?"+":"")+ml;

/* ---------- view switching ---------- */
function setView(v){
  const arena=v==="arena";
  document.body.dataset.view=v;
  $("#fantasyView").hidden=arena;$("#arenaView").hidden=!arena;
  document.querySelectorAll(".seg [data-view]").forEach(b=>b.setAttribute("aria-selected",b.dataset.view===v));
  $("#refresh").hidden=arena;$("#force").hidden=arena;
  if(arena&&!A)loadArena();
  if(arena)applyTheme();else{document.documentElement.style.removeProperty("--tc");document.documentElement.style.removeProperty("--tc2");if(typeof D!=="undefined"&&D)$("#pulled").textContent="Updated "+D.pulled}
  if(location.hash!=="#"+v)history.replaceState(null,"","#"+v);
}
document.querySelector(".seg").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)setView(b.dataset.view)});

async function loadArena(force){
  aTeam=getFav();
  try{
    let r=await fetch(`arena/${aTeam}.json?t=${Date.now()}`,{cache:"no-store"});
    if(!r.ok&&aTeam!=="mem"){aTeam="mem";setFav("mem");r=await fetch(`arena/mem.json?t=${Date.now()}`,{cache:"no-store"})}
    const j=await r.json(); if(!force&&A&&j.pulled===A.pulled)return; A=j; applyTheme(); renderArena();
  }catch(e){$("#aHero").innerHTML='<div class="mute">Arena data is still being built. Check back in a minute.</div>'}
}
setInterval(()=>{if(document.body.dataset.view==="arena")loadArena()},120000);
function applyTheme(){if(!A)return;const r=document.documentElement.style;r.setProperty("--tc",A.team.color);r.setProperty("--tc2",A.team.alt)}

/* ---------- render ---------- */
function renderArena(){
  aHero();aNext();aBets();aGames();aShots();aImpact();aTeamStats();aMedia();aNews();aSched();
  $("#pulled").textContent="Updated "+A.pulled;
}
function aHero(){
  const t=A.team,s=A.teamstats,last5=A.schedule.filter(g=>g.final).slice(-5);
  let teams=[t.abbr.toLowerCase()];
  fetch("arena/config.json?t="+Date.now(),{cache:"no-store"}).then(r=>r.json()).then(c=>{teams=c.teams||teams;const sel=$("#aTeamSel");if(sel)sel.innerHTML=teams.map(x=>`<option value="${x}" ${x===aTeam?"selected":""}>${x.toUpperCase()}</option>`).join("")}).catch(()=>{});
  $("#aHero").innerHTML=`<div class="tm-top">
    <img class="tlogo" src="${esc(t.logo)}" alt="${esc(t.name)} logo">
    <div style="min-width:0"><div class="eyebrow">Favorite team${t.conf?" · "+esc(t.conf):""}</div><h2 class="tname">${esc(t.name)}</h2>
      <div class="chips" style="margin-top:10px">${t.record?`<span class="pill">${esc(t.record)}${A.schedule.some(g=>g.final&&g.stype!=="Preseason")?"":" preseason"}</span>`:""}${t.seed&&A.schedule.some(g=>g.final&&g.stype!=="Preseason")?`<span class="pill">#${t.seed} in the ${esc(t.conf||"conference")}</span>`:""}<span class="pill">Net ${sign(s.net)} · ${esc(s.sample.toLowerCase())}</span>
      <span class="form">${last5.map(g=>`<i class="${g.res==="W"?"w":"l"}" title="${g.res} ${g.us}-${g.them} vs ${esc(g.opp)}">${g.res}</i>`).join("")}</span></div></div>
    <label class="tsel"><span class="faint" style="font-size:12px">Team</span><select id="aTeamSel" aria-label="Favorite team"><option>${t.abbr}</option></select></label></div>`;
  $("#aTeamSel").onchange=e=>{setFav(e.target.value);A=null;loadArena(true)};
}
function aNext(){
  const n=A.next;if(!n){$("#aNext").innerHTML='<div class="eyebrow">Next game</div><h2>No game scheduled</h2>';return}
  const o=n.odds,us=A.team.abbr,usML=o?(n.home?o.home_ml:o.away_ml):null,thML=o?(n.home?o.away_ml:o.home_ml):null;
  const usLine=o&&o.spread!=null?(n.home?+o.spread:-o.spread):null;
  const mkt=impl(usML),mw=n.model.win,ew=n.espn;
  const pk=n.pick,best=pk?pk[pk.best]:null;
  const bestTxt=!pk?"Lines aren't posted yet.":pk.best==="spread"?`<b>${best.side==="us"?esc(A.team.short):esc(n.opp_name)} ${sign(best.line)}</b>`:`<b>${best.side==="over"?"Over":"Under"} ${best.line}</b>`;
  const why=!pk?"":pk.best==="spread"?`Model has ${esc(A.team.short)} ${n.model.margin>=0?"winning":"losing"} by ${Math.abs(n.model.margin)}. The market line is ${esc(A.team.short)} ${sign(usLine)}. That's a ${best.edge}-point gap.`:`Model total ${n.model.total} vs market ${best.line}, a ${best.edge}-point gap.`;
  const conf=best?(best.edge>=6?"Strong lean":best.edge>=3?"Lean":"Slight lean"):"";
  const bar=(lbl,v)=>v==null?"":`<div class="wp"><span>${lbl}</span><div class="meter"><span style="width:${(v*100).toFixed(0)}%"></span></div><b class="num">${Math.round(v*100)}%</b></div>`;
  $("#aNext").innerHTML=`<div class="row"><span class="eyebrow">Next game · ${esc(n.stype)}</span><span class="pill" id="cd"></span></div>
    <div class="ng"><div class="ngt"><img src="${esc(A.team.logo)}" alt=""><b>${esc(us)}</b></div><div class="mid" style="padding:0">${n.home?"vs":"@"}</div><div class="ngt"><img src="${esc(n.opp_logo)}" alt=""><b>${esc(n.opp)}</b></div></div>
    <div class="faint" style="text-align:center;font-size:13px">${esc(ct(n.date))} CT${n.venue?" · "+esc(n.venue):""}${n.tv?" · "+esc(n.tv):""}</div>
    <div class="eyebrow" style="margin-top:6px">Win chance for ${esc(A.team.short)}</div>
    <div style="display:grid;gap:8px">${bar("Our model",mw)}${bar("ESPN BPI",ew)}${bar("Market (no vig)",mkt&&impl(thML)?mkt/(mkt+impl(thML)):mkt)}</div>
    ${o?`<div class="lines"><div><span class="faint">Spread</span><b class="num">${esc(us)} ${sign(usLine)}</b></div><div><span class="faint">Total</span><b class="num">${o.ou??"–"}</b></div><div><span class="faint">Moneyline</span><b class="num">${mlTxt(usML)} / ${mlTxt(thML)}</b></div><div><span class="faint">Book</span><b>${esc(o.provider)}</b></div></div>`:""}
    <div class="best"><div class="eyebrow" style="color:var(--tcText)">Best bet · ${conf}</div><div class="bb">${bestTxt}</div><div class="mute" style="font-size:13.5px">${why}</div></div>`;
  const tick=()=>{const el=$("#cd");if(!el)return;const ms=Date.parse(n.date)-Date.now();if(ms<=0){el.textContent="Live / started";return}const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4);el.textContent=`Tip in ${d?d+"d ":""}${h}h ${m}m`};tick();clearInterval(window.__cd);window.__cd=setInterval(tick,30000);
}
function aBets(){
  const r=A.record,graded=A.picks.filter(p=>p.result),open=A.picks.filter(p=>!p.result);
  const units=r.w+r.l+r.p,roi=units?r.profit/(units*r.stake):0;
  const row=p=>`<div class="pk"><span class="res ${p.result==="W"?"w":p.result==="L"?"l":""}">${p.result||"•"}</span><div style="min-width:0"><b>${p.kind==="spread"?(p.side==="us"?esc(A.team.abbr):esc(p.opp))+" "+sign(p.line):(p.side==="over"?"Over ":"Under ")+p.line}</b><div class="faint" style="font-size:12px">${cday(p.date)} · ${p.home?"vs":"@"} ${esc(p.opp)}${p.final?" · final "+p.final:""} · edge ${p.edge}</div></div><span class="num ${p.profit>0?"up":p.profit<0?"down":"faint"}">${p.profit!=null?(p.profit>0?"+$":p.profit<0?"−$":"$")+Math.abs(p.profit).toFixed(0):"open"}</span></div>`;
  $("#aBets").innerHTML=`<div class="sec-h"><div><div class="eyebrow">Model betting record · $100 a pick</div><h2>Picks tracker</h2></div></div>
    <div class="lines" style="grid-template-columns:repeat(3,1fr)"><div><span class="faint">Record</span><b class="num">${r.w}-${r.l}${r.p?"-"+r.p:""}</b></div><div><span class="faint">Profit</span><b class="num ${r.profit>0?"up":r.profit<0?"down":""}">${r.profit>=0?"+":"−"}$${Math.abs(r.profit).toFixed(0)}</b></div><div><span class="faint">ROI</span><b class="num">${units?(roi*100).toFixed(1)+"%":"–"}</b></div></div>
    <div class="pks">${[...open,...graded.slice().reverse()].slice(0,10).map(row).join("")||'<div class="mute" style="font-size:14px">The model logs one best bet before every regular-season game and grades it after the final. Preseason isn\'t tracked, so the first pick is the opener.</div>'}</div>
    <p class="faint" style="font-size:12px;margin:0">Picks are logged before tip and can't be changed after. Standard −110 pricing.</p>`;
}
function aGames(){
  const gs=A.games.slice().reverse();
  $("#aGames").innerHTML=`<div class="sec-h"><div><div class="eyebrow">Recent games</div><h2>Results and box scores</h2></div><span class="faint" style="font-size:13px">Tap a game</span></div>
    <div class="gstrip">${gs.map(g=>`<button type="button" class="gchip ${g.res==="W"?"w":"l"} ${aGame===g.id?"sel":""}" data-g="${g.id}"><span class="faint">${cday(g.date)} · ${g.home?"vs":"@"}</span><b>${esc(g.opp)}</b><span class="num">${g.res} ${g.us}-${g.them}</span>${g.stype==="Preseason"?'<small>PRE</small>':""}</button>`).join("")}</div>
    <div id="aBox"></div>`;
  $("#aGames .gstrip").onclick=e=>{const b=e.target.closest("[data-g]");if(!b)return;aGame=aGame===b.dataset.g?"all":b.dataset.g;aGames();aShots()};
  const g=A.games.find(x=>x.id===aGame);
  if(g){const bx=g.box.slice().sort((a,b)=>b.min-a.min);
    $("#aBox").innerHTML=`<div class="scroll" style="margin-top:14px"><table class="box"><thead><tr><th>Player</th><th class="r">MIN</th><th class="r">PTS</th><th class="r">REB</th><th class="r">AST</th><th class="r">STL</th><th class="r">BLK</th><th class="r">TO</th><th class="r">FG</th><th class="r">3PT</th><th class="r">FT</th><th class="r">+/-</th></tr></thead><tbody>${bx.map(b=>`<tr><td><span style="font-weight:500">${esc(b.n)}</span>${b.st?' <span class="faint" style="font-size:11px">S</span>':""}</td><td class="r num">${b.min}</td><td class="r num"><b>${b.pts}</b></td><td class="r num">${b.reb}</td><td class="r num">${b.ast}</td><td class="r num">${b.stl}</td><td class="r num">${b.blk}</td><td class="r num">${b.to}</td><td class="r num">${b.fgm}-${b.fga}</td><td class="r num">${b.tpm}-${b.tpa}</td><td class="r num">${b.ftm}-${b.fta}</td><td class="r num ${b.pm>0?"up":b.pm<0?"down":""}">${sign(b.pm)}</td></tr>`).join("")}</tbody></table></div>`}
}
/* shot chart */
function courtSVG(){const L='stroke="rgba(255,255,255,.28)" stroke-width="2" fill="none"';
  return `<rect x="1" y="1" width="498" height="468" ${L}/><rect x="170" y="1" width="160" height="190" ${L}/><circle cx="250" cy="190" r="60" ${L}/>
  <line x1="220" y1="40" x2="280" y2="40" ${L}/><circle cx="250" cy="52.5" r="7.5" ${L}/><path d="M210 52.5 A40 40 0 0 0 290 52.5" ${L}/>
  <path d="M30 1 V140 A237.5 237.5 0 0 0 470 140 V1" ${L}/><path d="M190 469 A60 60 0 0 1 310 469" ${L}/>`}
function zoneOf(x,y){const d=Math.hypot(x-25,y-5.25);if((y<14&&(x<3||x>47))||d>=23.75)return"three";return d<8?"paint":"mid"}
function aShots(){
  const games=aGame==="all"?A.games:A.games.filter(g=>g.id===aGame);
  let shots=games.flatMap(g=>g.shots);
  const ppl=[...new Map(A.games.flatMap(g=>g.box).map(b=>[b.pid,b.n])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  if(aPlayer!=="all")shots=shots.filter(s=>s[0]===aPlayer);
  const z={paint:[0,0],mid:[0,0],three:[0,0]};shots.forEach(s=>{const k=zoneOf(s[1],s[2]);z[k][1]++;if(s[3])z[k][0]++});
  const made=shots.filter(s=>s[3]).length;
  const dots=shots.map(s=>{const x=s[1]*10,y=s[2]*10;return s[3]?`<circle cx="${x}" cy="${y}" r="6.5" class="mk"/>`:`<path d="M${x-5} ${y-5}L${x+5} ${y+5}M${x+5} ${y-5}L${x-5} ${y+5}" class="ms"/>`}).join("");
  const g=A.games.find(x=>x.id===aGame);
  $("#aShots").innerHTML=`<div class="sec-h"><div><div class="eyebrow">${g?`${cday(g.date)} ${g.home?"vs":"@"} ${esc(g.opp)}`:`Last ${A.games.length} games`}</div><h2>Shot chart</h2></div>
    <select id="aPl" aria-label="Player"><option value="all">All players</option>${ppl.map(([id,n])=>`<option value="${id}" ${id===aPlayer?"selected":""}>${esc(n)}</option>`).join("")}</select></div>
    <svg class="court" viewBox="0 0 500 470" role="img" aria-label="Shot chart: ${made} makes of ${shots.length} shots">${courtSVG()}${dots}</svg>
    <div class="zones">${[["paint","Paint"],["mid","Midrange"],["three","Three"]].map(([k,l])=>`<div><span class="faint">${l}</span><b class="num">${z[k][1]?Math.round(100*z[k][0]/z[k][1])+"%":"–"}</b><span class="faint num" style="font-size:11.5px">${z[k][0]}/${z[k][1]}</span></div>`).join("")}<div><span class="faint">Total</span><b class="num">${shots.length?Math.round(100*made/shots.length)+"%":"–"}</b><span class="faint num" style="font-size:11.5px">${made}/${shots.length}</span></div></div>
    <div class="faint" style="font-size:12px;display:flex;gap:14px"><span><svg width="10" height="10"><circle cx="5" cy="5" r="4.5" class="mk"/></svg> Make</span><span><svg width="10" height="10"><path d="M1 1L9 9M9 1L1 9" class="ms"/></svg> Miss</span>${aGame!=="all"?'<button class="b" type="button" id="aAll" style="padding:3px 10px;font-size:12px">Show all games</button>':""}</div>`;
  $("#aPl").onchange=e=>{aPlayer=e.target.value;aShots()};
  const all=$("#aAll");if(all)all.onclick=()=>{aGame="all";aGames();aShots()};
}
/* impact */
const METRICS=[["impact","Impact",p=>p.impact,v=>v.toFixed(1)],["pts","Points",p=>p.pts,v=>v.toFixed(1)],["pm","+/−",p=>p.pm,v=>sign(v.toFixed(1))],["reb","Rebounds",p=>p.reb,v=>v.toFixed(1)],["ast","Assists",p=>p.ast,v=>v.toFixed(1)],["stocks","Stocks",p=>p.stocks,v=>v.toFixed(1)],["ts","True shooting",p=>p.gp&&p.min>=8?p.ts:0,pct],["usg","Usage",p=>p.min>=8?p.usg:0,pct]];
function aImpact(){
  const m=METRICS.find(x=>x[0]===aMetric),ps=A.players.filter(p=>p.min>=4).slice().sort((a,b)=>m[2](b)-m[2](a)).slice(0,10);
  const mx=Math.max(...ps.map(m[2]).map(Math.abs))||1;
  $("#aImpact").innerHTML=`<div class="sec-h"><div><div class="eyebrow">Per game · ${esc(A.teamstats.sample.toLowerCase())}</div><h2>Impact players</h2></div></div>
    <div class="filters">${METRICS.map(x=>`<button type="button" class="fchip" data-m="${x[0]}" aria-selected="${x[0]===aMetric}">${x[1]}</button>`).join("")}</div>
    <div class="lb">${ps.map((p,i)=>`<button type="button" class="lbr" data-p="${p.pid}"><span class="rk" style="font-size:18px">${i+1}</span><img src="${esc(p.hs)}" alt="" onerror="this.style.visibility='hidden'"><div style="min-width:0"><b>${esc(p.n)}</b><div class="faint" style="font-size:12px">${esc(p.pos)} · ${p.gp} GP · ${p.min} min · ${p.pts}p ${p.reb}r ${p.ast}a · TS ${pct(p.ts)}</div><div class="bars" style="margin-top:6px"><i style="width:${Math.max(4,100*Math.abs(m[2](p))/mx).toFixed(0)}%;background:var(--tcText)"></i></div></div><b class="num" style="font-size:17px">${m[3](m[2](p))}</b></button>`).join("")}</div>
    <p class="faint" style="font-size:12px;margin:0">Impact = points + 1.2×reb + 1.5×ast + 3×(stl+blk) − TO + half of +/−, per game. Tap a player to see his shots.</p>`;
  $("#aImpact .filters").onclick=e=>{const b=e.target.closest("[data-m]");if(b){aMetric=b.dataset.m;aImpact()}};
  $("#aImpact .lb").onclick=e=>{const b=e.target.closest("[data-p]");if(b){aPlayer=b.dataset.p;aShots();$("#aShots").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"})}};
}
function aTeamStats(){
  const s=A.teamstats;
  const cmp=(lbl,us,them,fmt,lowerBetter)=>{const better=lowerBetter?us<them:us>them;const tot=Math.abs(us)+Math.abs(them)||1;return `<div class="cmp"><div class="row"><span class="mute">${lbl}</span><span class="num"><b class="${better?"up":"down"}">${fmt(us)}</b> <span class="faint">vs ${fmt(them)}</span></span></div><div class="duo"><i style="width:${(100*Math.abs(us)/tot).toFixed(0)}%"></i><i style="width:${(100*Math.abs(them)/tot).toFixed(0)}%"></i></div></div>`};
  const f1=v=>v.toFixed(1),fp=v=>pct(v);
  const tiles=[["Offensive rating",s.ortg],["Defensive rating",s.drtg],["Net rating",sign(+(s.ortg-s.drtg).toFixed(1))],["Pace",s.pace],["eFG%",pct(s.efg)],["3P%",pct(s.tp)],["FT%",pct(s.ft)],["Points",s.ppg]];
  const def=A.players.filter(p=>p.min>=8).slice().sort((a,b)=>(b.stl+b.blk+0.3*b.dreb+0.1*b.pm)-(a.stl+a.blk+0.3*a.dreb+0.1*a.pm)).slice(0,5);
  $("#aTeam").innerHTML=`<div class="sec-h"><div><div class="eyebrow">${esc(s.sample)} · ${s.gp} games · ${s.w}-${s.l}</div><h2>Advanced team stats</h2></div></div>
    <div class="tiles">${tiles.map(([l,v])=>`<div><span class="faint">${l}</span><b class="num">${v}</b></div>`).join("")}</div>
    <div class="two" style="gap:28px;margin-top:18px">
      <div><div class="eyebrow" style="margin-bottom:10px">Us vs opponents</div><div class="cmps">
        ${cmp("Points",s.ppg,s.oppg,f1)}${cmp("Effective FG%",s.efg,s.o_efg,fp)}${cmp("Rebounds",s.reb,s.o_reb,f1)}${cmp("Offensive rebounds",s.oreb,s.o_oreb,f1)}${cmp("Assists",s.ast,s.o_ast,f1)}${cmp("Turnovers",s.to,s.o_to,f1,true)}</div></div>
      <div><div class="eyebrow" style="margin-bottom:10px">Defense</div><div class="cmps">
        ${cmp("Opponent eFG% (lower is better)",s.o_efg,s.efg,fp,true)}${cmp("Steals",s.stl,s.o_stl,f1)}${cmp("Blocks",s.blk,s.o_blk,f1)}${cmp("Defensive rebounds",s.dreb,s.o_dreb,f1)}</div>
        <div class="eyebrow" style="margin:16px 0 8px">Top defenders</div>
        ${def.map(p=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line);font-size:14px"><span>${esc(p.n)}</span><span class="num faint">${p.stl} stl · ${p.blk} blk · ${p.dreb} dreb · <span class="${p.pm>0?"up":p.pm<0?"down":""}">${sign(p.pm)}</span></span></div>`).join("")}</div></div>`;
}
function aMedia(){
  const yt=A.yt||[],ev=A.espn_videos||[];
  $("#aMedia").innerHTML=`<div class="sec-h"><div><div class="eyebrow">${esc(A.team.short)} on YouTube${ev.length?" and ESPN":""}</div><h2>Highlights and posts</h2></div></div>
    ${yt.length?`<div class="vgrid">${yt.slice(0,12).map((v,i)=>`<button type="button" class="vcard ${i===0?"big":""}" data-vid="${esc(v.vid)}"><img loading="lazy" src="${esc(v.img)}" alt=""><div class="play"><span></span></div><div class="cap">${esc(v.title)}<div class="faint" style="font-size:11.5px;margin-top:2px">${ago(v.date)}</div></div></button>`).join("")}</div>`:'<div class="mute">No team videos yet.</div>'}
    ${ev.length?`<div class="vids" style="margin-top:12px">${ev.map(v=>`<a class="vcard" href="${esc(v.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(v.img)}" alt="" onerror="this.remove()"><div class="play"><span></span></div><div class="cap">${esc(v.title)}</div></a>`).join("")}</div>`:""}`;
}
function aNews(){
  $("#aNews").innerHTML=`<div class="sec-h"><div><div class="eyebrow">ESPN</div><h2>Latest articles</h2></div></div><div class="stack">${(A.news||[]).slice(0,10).map(x=>`<a class="item" href="${esc(x.url)}" target="_blank" rel="noopener"><div class="th">${x.img?`<img loading="lazy" src="${esc(x.img)}" alt="" onerror="this.remove()">`:""}</div><div style="min-width:0"><div class="kick"><span>${ago(x.date)}</span></div><h4>${esc(x.title)}</h4>${x.text?`<p>${esc(x.text)}</p>`:""}</div></a>`).join("")||'<div class="mute">No articles right now.</div>'}</div>`;
}
function aSched(){
  const up=A.schedule.filter(g=>!g.final&&g.stype!=="Preseason").slice(0,12);
  $("#aSched").innerHTML=`<div class="sec-h"><div><div class="eyebrow">${A.schedule.filter(g=>g.stype==="Regular season").length} regular-season games</div><h2>Schedule</h2></div></div>
    <div class="sch">${up.map(g=>`<div class="sg"><img src="${esc(g.opp_logo)}" alt=""><div style="min-width:0"><b>${g.home?"vs":"@"} ${esc(g.opp_name)}</b><div class="faint" style="font-size:12.5px">${esc(ct(g.date))} CT${g.tv?" · "+esc(g.tv):""}</div></div></div>`).join("")}</div>`;
}
document.addEventListener("click",e=>{const b=e.target.closest("#arenaView [data-vid]");if(!b)return;e.preventDefault();
  const m=document.createElement("div");m.className="modal";m.innerHTML=`<div style="display:grid;gap:10px;width:min(960px,100%)"><button class="b" type="button" style="justify-self:end">Close ✕</button><iframe class="vplayer" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.vid)}?autoplay=1&rel=0" title="Highlight" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  document.body.appendChild(m);const close=()=>m.remove();m.querySelector(".b").onclick=close;m.addEventListener("click",ev=>{if(ev.target===m)close()})});

setView(location.hash==="#arena"?"arena":"fantasy");
