/* Live matchup layer for the Fantasy view.
   - Pulls today's NBA box scores straight from ESPN every minute while games are on (normGame/normBox from season.js).
   - Live score = official ESPN points from earlier days (data.json act) + today's starters from the live box scores.
   - Pace vs the start-of-week projection (data.json base), live player notes, week form, and day-by-day drilldowns. */
let LV={games:{},rows:{},at:0,ok:false},lvTimer=null,openDay=null;
const CT=()=>new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
const isoCT=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const TODAY=()=>isoCT(CT());
const r1=x=>Math.round(x*10)/10;
const isBench=s=>s==="BE"||s==="IR";

/* ---------- live data ---------- */
async function liveTick(){
  clearTimeout(lvTimer);
  if(typeof normGame!=="function"||!D){lvTimer=setTimeout(liveTick,5000);return}
  try{
    const d=TODAY().replace(/-/g,"");
    const sb=await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}&limit=30`,{cache:"no-store"})).json();
    const games={},rows={};
    const ev=(sb.events||[]);
    for(const e of ev){const g=normGame(e);const st=(e.status||{});g.period=st.period||0;g.clock=st.displayClock||"";g.f=progress(g);games[g.home.abbr]=g;games[g.away.abbr]=g}
    const need=ev.filter(e=>((e.status||{}).type||{}).state!=="pre");
    const boxes=await Promise.all(need.map(e=>fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${e.id}`,{cache:"no-store"}).then(r=>r.json()).then(normBox).catch(()=>[])));
    boxes.flat().forEach(r=>{rows[r.id]=r});
    LV={games,rows,at:Date.now(),ok:true};
  }catch(e){LV.ok=false}
  renderLive();
  const anyLive=Object.values(LV.games).some(g=>g.state==="in"),anySoon=Object.values(LV.games).some(g=>g.state==="pre");
  lvTimer=setTimeout(liveTick,anyLive?45000:anySoon?180000:900000);
}
function progress(g){
  if(g.state==="post")return 1;if(g.state!=="in")return 0;
  const [m,s]=String(g.clock||"12:00").split(":").map(Number);const left=(m||0)+(s||0)/60;
  if(g.period>4)return .99;return Math.max(0,Math.min(.99,((g.period-1)*12+(12-left))/48));
}
const gameOf=p=>LV.games[p.tm];

/* ---------- numbers ---------- */
function liveScore(t){
  const today=TODAY(),act=D.act||{};let past=0;
  for(const iso of Object.keys(act))if(iso<today)past+=((act[iso]||{})[t]||{}).tot||0;
  let todayPts=((act[today]||{})[t]||{}).tot||0;
  if(LV.ok){todayPts=0;for(const p of P(t)){if(isBench(p.slot))continue;const g=gameOf(p);if(!g||g.state==="pre")continue;const r=LV.rows[p.id];if(r&&!r.dnp)todayPts+=r.fp}}
  if(!D.act)return D.teams[t].live;
  return r1(past+todayPts);
}
function todayPlan(t){const d=(D.teams[t].daily||[]).find(x=>x.iso===TODAY());return d||null}
function remaining(t){
  const today=TODAY(),T=D.teams[t];if(!LV.ok)return T.rest;
  let rest=0;for(const d of T.daily||[])if(d.iso>today)rest+=d.pts;
  const td=todayPlan(t);if(!td)return r1(rest);
  const byName=Object.fromEntries(P(t).map(p=>[p.n,p]));
  const ids=new Set([...(td.locked||[]),...td.start.map(([,n])=>byName[n]&&byName[n].id)].filter(Boolean));
  for(const id of ids){const p=P(t).find(x=>x.id===id);if(!p)continue;const g=gameOf(p),pp=(td.pp||{})[id]||0;
    if(!g||g.state==="pre")rest+=pp;else if(g.state==="in")rest+=pp*(1-g.f)}
  return r1(rest);
}
function expectedSoFar(t){
  const B=D.base&&D.base.teams&&D.base.teams[t];if(!B)return null;const today=TODAY();let e=0;
  for(const [iso,d] of Object.entries(B.days))if(iso<today)e+=d.pts;
  // today: the players actually in the starting lineup now, at today's projection (the same number the player
  // notes use), scaled by how much of each game is done. The Monday plan can have other starters and older
  // projections, which made pace disagree with the player-by-player numbers.
  const td=todayPlan(t),bd=B.days[today],pp=(td&&td.pp)||(bd&&bd.pp)||{};
  const srvToday=new Set((((D.act||{})[today]||{})[t]||{pl:[]}).pl.map(x=>x[0]));
  for(const p of P(t)){if(isBench(p.slot))continue;const g=gameOf(p);const f=g?g.f:(LV.ok?0:(srvToday.has(p.id)?1:0));e+=(pp[p.id]||0)*f}
  return r1(e);
}
const isLiveWeek=()=>D&&D.opp&&(liveScore(D.me)>0||liveScore(D.opp)>0||Object.values(LV.games).some(g=>g.state!=="pre"));

/* ---------- player notes ---------- */
function notes(t,limit){
  const out=[];
  for(const p of P(t)){
    if(isBench(p.slot))continue;const g=gameOf(p);if(!g||g.state==="pre")continue;const r=LV.rows[p.id];
    const proj=((todayPlan(t)||{}).pp||{})[p.id]||(D.base&&D.base.teams[t]&&(D.base.teams[t].days[TODAY()]||{}).pp||{})[p.id]||p.v||0;
    const nm=esc(p.n),qtr=g.state==="post"?"":g.period>4?"in OT":g.period<=1?"in the 1st":g.period===2?"in the first half":g.period===3?"through three quarters":"in the 4th";
    if(!r||r.dnp){if(g.state==="post"||(g.state==="in"&&g.f>.5))out.push({p,s:-2,t:`<b>${nm}</b> hasn't logged minutes${g.state==="post"?" and won't score today":" yet"}.`});continue}
    const pace=g.state==="post"?r.fp:r.fp/Math.max(g.f,.08),ratio=proj?pace/proj:1,line=`${r.pts} pts, ${r.reb} reb, ${r.ast} ast${r.stl+r.blk?`, ${r.stl+r.blk} stocks`:""}`;
    let txt,score=r.fp-proj*(g.state==="post"?1:g.f);
    if(g.state==="post"){const dlt=r1(r.fp-proj);txt=`<b>${nm}</b> finished with <b>${r.fp}</b> (${line}), ${Math.abs(dlt)<3?"right on":dlt>0?`<span class="up">${dlt} over</span>`:`<span class="down">${-dlt} under</span>`} his ${r1(proj)} projection.`}
    else if(g.f<.3)txt=`<b>${nm}</b> has ${r.fp} ${qtr} (${line}). Too early to read much into it.`;
    else if(ratio>=1.3)txt=`<b>${nm}</b> is rolling ${qtr}: ${r.fp} so far (${line}), on pace for about ${Math.round(pace)} vs ${Math.round(proj)} projected.`;
    else if(ratio<=.65)txt=`<b>${nm}</b> is quiet ${qtr}: ${r.fp} in ${r.min} min (${line}). On pace for about ${Math.round(pace)} of his ${Math.round(proj)}.`;
    else txt=`<b>${nm}</b> is tracking close to his number: ${r.fp} ${qtr} (${line}), pace ${Math.round(pace)} vs ${Math.round(proj)}.`;
    const tens=[r.pts,r.reb,r.ast,r.stl,r.blk].filter(x=>x>=8).length;
    if(g.state==="in"&&tens>=2&&[r.pts,r.reb,r.ast,r.stl,r.blk].filter(x=>x>=10).length<2)txt+=` Double-double watch (+5).`;
    if(g.state==="in"&&r.pf>=4)txt+=` <span class="down">${r.pf} fouls</span> could cap his minutes.`;
    out.push({p,s:score,t:txt});
  }
  return out.sort((a,b)=>Math.abs(b.s)-Math.abs(a.s)).slice(0,limit||99);
}
function weekForm(t){
  const B=D.base&&D.base.teams[t];if(!B)return [];const today=TODAY(),acc={};
  for(const [iso,day] of Object.entries(D.act||{})){if(iso>=today)continue;const bd=B.days[iso]||{pp:{}};
    for(const [id,n,slot,fp] of (day[t]||{}).pl||[]){if(isBench(slot))continue;const pr=bd.pp[id];if(pr==null)continue;const a=acc[id]||(acc[id]={n,act:0,proj:0,g:0});a.act+=fp;a.proj+=pr;a.g++}}
  if(LV.ok)for(const p of P(t)){if(isBench(p.slot))continue;const g=gameOf(p);if(!g||g.state!=="post")continue;const r=LV.rows[p.id];if(!r||r.dnp)continue;
    const pr=((B.days[today]||{}).pp||{})[p.id];if(pr==null)continue;const a=acc[p.id]||(acc[p.id]={n:p.n,act:0,proj:0,g:0});a.act+=r.fp;a.proj+=pr;a.g++}
  return Object.values(acc).map(a=>({...a,d:r1(a.act-a.proj)}));
}

/* ---------- render: hero live block ---------- */
function renderLive(){
  if(typeof renderMood==="function")try{renderMood()}catch(e){console.error(e)}
  if(typeof renderResults==="function")try{renderResults()}catch(e){console.error(e)}
  if(!D||!D.opp||!$("#hero"))return;
  if(!isLiveWeek()){const el=$("#liveBox");if(el)el.innerHTML="";renderHeroDays();return}
  const me=D.me,op=D.opp,T=D.teams;
  const sm=liveScore(me),so=liveScore(op),fm=r1(sm+remaining(me)),fo=r1(so+remaining(op));
  const bm=D.base&&D.base.teams[me]?D.base.teams[me].proj:null,bo=D.base&&D.base.teams[op]?D.base.teams[op].proj:null;
  const em=expectedSoFar(me),eo=expectedSoFar(op);
  const big=document.querySelectorAll("#hero .side .big");
  if(big.length===2){big[0].textContent=Math.round(sm);big[1].textContent=Math.round(so);big[0].classList.toggle("faint",sm<so);big[1].classList.toggle("faint",so<sm);big.forEach(b=>b.dataset.live="1")}
  const subs=document.querySelectorAll("#hero .side .sub");
  const sub=(f,b,e,s)=>`Projected final <b class="num">${Math.round(f)}</b>${b!=null?` · started week at ${Math.round(b)}`:""}`;
  if(subs.length===2){subs[0].innerHTML=sub(fm,bm);subs[1].innerHTML=sub(fo,bo)}
  const lead=r1(sm-so),pace=(s,e)=>e==null?"":(()=>{const d=r1(s-e);return Math.abs(d)<2?`on pace`:d>0?`<span class="up">${d} ahead</span> of pace`:`<span class="down">${-d} behind</span> pace`})();
  const liveG=Object.values(LV.games).filter((g,i,a)=>a.indexOf(g)===i&&g.state==="in").length;
  $("#liveBox").innerHTML="";   // the status card above already has pace; under the score it's just the days
  renderHeroDays();
  const ex=$("#heroX");if(ex&&ex.classList.contains("open")){const dt=ex.querySelector("#dayTbl");if(dt)dt.outerHTML=dayTable(me,op)}
  const cx=$("#cardX");if(cx&&cx.classList.contains("open")){const dt=cx.querySelector("#dayTbl");if(dt&&dt.dataset.h&&dt.dataset.a)dt.outerHTML=dayTable(+dt.dataset.h,+dt.dataset.a)}
}

/* ---------- day table with per-player drilldown ---------- */
function dayInfo(t,iso){
  const today=TODAY(),B=D.base&&D.base.teams[t],bd=B&&B.days[iso],cur=(D.teams[t].daily||[]).find(x=>x.iso===iso);
  const proj=bd?bd.pts:cur?cur.pts:0;
  let actual=null;
  if(iso<today)actual=((D.act||{})[iso]||{})[t]?D.act[iso][t].tot:null;
  else if(iso===today){const past=liveScore(t);let before=0;for(const k of Object.keys(D.act||{}))if(k<today)before+=((D.act[k]||{})[t]||{}).tot||0;actual=r1(past-before);if(!actual&&!Object.values(LV.games).some(g=>g.state!=="pre"))actual=null}
  const starts=bd?bd.start.length:cur?cur.start.length:0;
  return {proj,actual,starts,now:cur?cur.pts:null};
}
/* Lineup check for today and upcoming days: who has a game but sits on the bench in the team's current ESPN
   lineup (ESPN carries today's lineup forward until the manager changes it), and what their best lineup adds. */
function lineupCheck(t,iso){
  const today=TODAY();if(iso<today)return null;
  const cur=(D.teams[t].daily||[]).find(x=>x.iso===iso);if(!cur)return null;
  const pp=cur.pp||{},ps=P(t).filter(p=>pp[p.id]!=null&&p.slot!=="IR");
  const benched=ps.filter(p=>p.slot==="BE").map(p=>({n:p.n,proj:pp[p.id]})).sort((a,b)=>b.proj-a.proj);
  const now=ps.filter(p=>p.slot!=="BE").reduce((s,p)=>s+pp[p.id],0);
  const lockedPts=(cur.locked||[]).reduce((s,id)=>s+(pp[id]||0),0);
  const best=cur.pts+lockedPts,gain=Math.max(0,best-now);
  const idle=D.slots.length-ps.filter(p=>p.slot!=="BE").length;  // starting slots whose player has no game
  return {benched,now,best,gain,idle};
}
function dayPlayers(t,iso){
  const today=TODAY(),B=D.base&&D.base.teams[t],bd=(B&&B.days[iso])||{pp:{},start:[]},cur=(D.teams[t].daily||[]).find(x=>x.iso===iso);
  const name=id=>{const p=D.players.find(x=>x.id==id)||(typeof SEA!=="undefined"&&SEA&&SEA.players||[]).find(x=>x.id==id);return p?p.n:"Former player"};
  let rows=[];
  if(iso<today&&(D.act||{})[iso]&&D.act[iso][t]){
    rows=D.act[iso][t].pl.map(([id,n,slot,fp])=>({n,slot,proj:bd.pp[id],act:fp,st:"Final"}));
    for(const id of bd.start)if(!rows.some(r=>r.n===name(id)))rows.push({n:name(id),slot:"–",proj:bd.pp[id],act:null,st:"dropped"});
  }else if(iso===today){
    const pp={...(bd.pp||{}),...((cur||{}).pp||{})};
    const srv=Object.fromEntries((((D.act||{})[iso]||{})[t]||{pl:[]}).pl.map(x=>[x[0],x[3]]));
    rows=P(t).filter(p=>pp[p.id]!=null).map(p=>{const g=gameOf(p),r=LV.rows[p.id];
      const act=LV.ok?(g&&g.state!=="pre"&&r&&!r.dnp?r.fp:g&&g.state==="post"?0:null):(srv[p.id]??null);
      // live games: compare against the share of his projection that should be in by now, not the full number
      const exp=g&&g.state==="in"?pp[p.id]*g.f:null;
      return {n:p.n,slot:p.slot,proj:pp[p.id],act,exp,st:(p.slot==="BE"&&(!g||g.state==="pre")?"bench, has a game · ":"")+(g?(g.state==="in"?g.detail:g.state==="post"?"Final":g.detail):LV.ok?"":"as of last update")}});
  }else{
    const pp=(cur||{}).pp||{};
    rows=P(t).filter(p=>pp[p.id]!=null&&p.slot!=="IR").map(p=>({n:p.n,slot:p.slot,proj:pp[p.id],act:null,st:p.slot==="BE"?"bench, has a game":""}));
  }
  return rows.sort((a,b)=>(isBench(a.slot)-isBench(b.slot))||((b.act??b.proj??0)-(a.act??a.proj??0)));
}
function lineupNote(t,iso){const L=lineupCheck(t,iso);if(!L||(!L.benched.length&&L.gain<1))return "";
  const mine=t==D.me;
  if(iso>TODAY())return `<div class="lnote"><b>Not set yet.</b> ${L.benched.length?`In ${mine?"your":"their"} current lineup, ${L.benched.map(b=>esc(b.n)).join(", ")} ${L.benched.length>1?"are":"is"} on the bench for this day. `:""}ESPN carries today's lineup forward, so the projection assumes ${mine?"you start":"they start"} the best players that morning. If ${mine?"you":"they"} don't, it's about ${Math.round(L.gain)} lower.${mine?` <span class="faint">Your auto-lineup sets it at 10:30 AM.</span>`:""}</div>`;
  return `<div class="lnote ${L.gain>=5?"warn":""}"><b>${L.benched.length} on the bench with a game:</b> ${L.benched.map(b=>`${esc(b.n)} (${r1(b.proj)})`).join(", ")}.
    ${L.gain>=1?` The projection assumes ${mine?"you start":"they start"} the best lineup. As it stands right now, ${mine?"you'd":"they'd"} score about <b>${Math.round(L.gain)} less</b>.`:" They project lower than the starters, so it barely matters."}
    ${mine?` <span class="faint">Your auto-lineup sets this at 10:30 AM on game days; tap Set lineup if it hasn't run.</span>`:""}</div>`}
function playersTbl(t,iso){
  const rows=dayPlayers(t,iso);if(!rows.length)return `<div class="dteam faint">No games.</div>`;
  const tot=rows.filter(r=>!isBench(r.slot));
  return `<div class="dteam"><table class="tbl dtbl"><thead><tr><th>${esc(D.teams[t].name)}</th><th>Slot</th><th>Proj</th><th>Actual</th><th>+/-</th></tr></thead><tbody>
    ${rows.map(r=>{const d=r.act!=null&&r.proj!=null&&r.proj>0.5?r1(r.act-(r.exp??r.proj)):null;return `<tr class="${isBench(r.slot)?"bn":""}"><td><span class="nm">${esc(r.n)}<small>${esc(r.st||"")}</small></span></td><td>${esc(r.slot)}</td><td>${r.proj!=null?r1(r.proj):"–"}</td><td class="fp">${r.act!=null?r.act:"–"}</td><td class="${d==null?"":d>=0?"up":"down"}" ${r.exp!=null?`title="vs ${r1(r.exp)} expected by now"`:""}>${d==null?"":(d>0?"+":"")+d}${r.exp!=null?'<small class="faint"> pace</small>':""}</td></tr>`}).join("")}
    <tr class="tt"><td>Starters</td><td></td><td>${r1(tot.reduce((s,r)=>s+(r.proj||0),0))}</td><td class="fp">${tot.some(r=>r.act!=null)?r1(tot.reduce((s,r)=>s+(r.act||0),0)):"–"}</td><td></td></tr></tbody></table>${lineupNote(t,iso)}</div>`;
}
function dayTable(h,a){
  const days=D.all_days||(D.teams[h].daily||[]).map(x=>x.iso),today=TODAY();
  const lbl=iso=>{const d=new Date(iso+"T12:00:00");return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})};
  const cell=(t,iso)=>{const x=dayInfo(t,iso),L=iso===today?lineupCheck(t,iso):null,flag=L&&L.gain>=5?` <span class="bflag" title="${L.benched.length} on the bench with a game; best lineup adds about +${Math.round(L.gain)}">⚠ ${L.benched.length} benched</span>`:"";
    if(x.actual!=null){
      // above or below schedule: finished days against the full projection, today against what should be in by now
      let exp=x.proj,live=false;
      if(iso===today){const e=expectedSoFar(t),B=D.base&&D.base.teams[t];if(e!=null&&B){let before=0;for(const [k,d] of Object.entries(B.days))if(k<today)before+=d.pts;exp=Math.max(0,e-before);live=exp<x.proj-.5}}
      const dl=Math.round(x.actual-exp),dc=Math.abs(dl)<3?"even":dl>0?"up":"down";
      const badge=`<span class="dvs ${dc}" title="${live?`vs ${Math.round(exp)} expected by now`:`vs ${Math.round(x.proj)} projected`}">${dc==="even"?"±0":(dl>0?"+":"−")+Math.abs(dl)}${live?"<small> pace</small>":""}</span>`;
      return `<span class="num">${Math.round(x.actual)}</span> <span class="faint">/ ${Math.round(x.proj)}</span> ${badge}${flag}`}
    return x.actual!=null?"":`<span class="num">${Math.round(x.now??x.proj)}</span> <span class="faint">· ${x.starts}</span>${flag}`};
  return `<div id="dayTbl" data-h="${h}" data-a="${a}"><div class="scroll"><table class="dayt"><thead><tr><th>Day</th><th class="r">${esc(D.teams[h].name)}</th><th class="r">${esc(D.teams[a].name)}</th></tr></thead><tbody>
    ${days.map(iso=>`<tr class="drow ${iso===today?"today":iso<today?"past":""} ${openDay===iso?"open":""}" data-iso="${iso}" tabindex="0" aria-expanded="${openDay===iso}"><td>${lbl(iso)}${iso===today?' <span class="pill" style="padding:1px 7px">Today</span>':""}</td><td class="r">${cell(h,iso)}</td><td class="r">${cell(a,iso)}</td></tr>
      ${openDay===iso?`<tr class="dsub"><td colspan="3"><div class="dsplit">${playersTbl(h,iso)}${playersTbl(a,iso)}</div></td></tr>`:""}`).join("")}
    </tbody></table></div><p class="faint" style="font-size:12px;margin:8px 0 0">Played days show actual / projected at the start of the week, then how far above or below that they finished (today: against what should be in by now). Upcoming days show the best-lineup projection · starts. ⚠ (today only) means players with a game are sitting on the bench in that team's lineup right now. Tap a day for every player.</p></div>`;
}
document.addEventListener("click",e=>{const r=e.target.closest(".drow");if(!r)return;e.stopPropagation();openDay=openDay===r.dataset.iso?null:r.dataset.iso;const t=r.closest("#dayTbl");t.outerHTML=dayTable(+t.dataset.h,+t.dataset.a)},true);
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.classList&&e.target.classList.contains("drow"))e.target.click()});
liveTick();

/* ---------- hero: day by day ----------
   One strip of days under the score: each day shows both teams' points (actual once played, projected after), with
   a colored edge for who took the day. Tap a day for every player. Player deltas are against a real baseline: his
   projection for that day, or his season average when the projection was 0 (listed out at the time), so a guy who
   was projected 0 and scored 30 reads "30 · avg 28", not "+30". Live games compare against the share of his
   projection that should be in by now. */
let hDay=null,hSide="me";
function hdBase(t,r){const p=D.players.find(x=>x.n===r.n);const avg=p?p.v:null;
  if(r.proj!=null&&r.proj>0.5)return {b:r.proj,lab:"proj"};return avg?{b:avg,lab:"avg"}:{b:null,lab:""}}
function hdRow(t,r){
  const bn=isBench(r.slot),{b,lab}=hdBase(t,r),live=r.exp!=null,fin=r.act!=null&&!live;
  let main,chip="";
  if(r.act==null){main=`<b class="faint">${b!=null?Math.round(b):"–"}</b>`;chip=`<span class="hdc">${lab||"proj"}</span>`}
  else{main=`<b>${Math.round(r.act)}</b>`;
    const pl=D.players.find(x=>x.n===r.n),g=pl?gameOf(pl):null,base=live?(b!=null&&g?b*g.f:null):b;
    if(base!=null){const d=Math.round(r.act-base),c=Math.abs(d)<3?"even":d>0?"up":"down";
      chip=`<span class="hdc ${c}" title="${live?`vs ${Math.round(base)} expected by now`:`vs ${Math.round(b)} ${lab==="avg"?"season average (projected 0 that day)":"projected"}`}">${c==="even"?"even":(d>0?"+":"−")+Math.abs(d)}${live?" pace":lab==="avg"?" vs avg":""}</span>`}
    else if(live)chip=`<span class="hdc">live</span>`}
  const st=(r.st||"").replace(/^bench, has a game · /,"").replace("as of last update","");
  return `<div class="hdp ${bn?"bn":""} ${live?"live":""}"><div><span class="n">${esc(r.n)}</span><small>${bn?"Bench · ":""}${esc(st||(r.act==null?"":"Final"))}</small></div><div class="v">${main}${chip}</div></div>`}
function hdTeam(t,iso){const rows=dayPlayers(t,iso);
  if(!rows.length)return `<div class="hdteam"><p class="faint" style="margin:6px 2px">No games this day.</p></div>`;
  const on=rows.filter(r=>!isBench(r.slot)),bn=rows.filter(r=>isBench(r.slot));
  return `<div class="hdteam">${on.map(r=>hdRow(t,r)).join("")}${bn.length?`<div class="hdgrp">Bench</div>${bn.map(r=>hdRow(t,r)).join("")}`:""}${lineupNote(t,iso)}</div>`}
function heroDays(h,a){
  const days=D.all_days||(D.teams[h].daily||[]).map(x=>x.iso),today=TODAY();if(!days.length)return "";
  if(!hDay||!days.includes(hDay))hDay=days.includes(today)?today:(days.find(x=>x>today)||days[days.length-1]);
  // today's plan total leaves out players whose game had started at the last pull, so add the lineup's projections back
  const tp=t=>{const td=todayPlan(t)||{},pp=td.pp||{};return P(t).filter(p=>!isBench(p.slot)&&pp[p.id]!=null).reduce((a,p)=>a+pp[p.id],0)};
  const val=(t,iso)=>{const x=dayInfo(t,iso);return x.actual!=null?{v:x.actual,act:true}:{v:iso===today?tp(t):(x.now??x.proj),act:false}};
  let won=0,lost=0;
  const chips=days.map(iso=>{const m=val(h,iso),o=val(a,iso),past=iso<today,isT=iso===today,diff=m.v-o.v;
    if(past&&m.act){if(diff>0)won++;else if(diff<0)lost++}
    const d=new Date(iso+"T12:00:00"),res=Math.abs(diff)<.5?"":diff>0?"w":"l";
    return `<button type="button" class="hdd ${past?"past":isT?"today":"next"} ${res} ${hDay===iso?"sel":""}" data-hd="${iso}" aria-pressed="${hDay===iso}">
      <span class="dn">${isT?"Today":d.toLocaleDateString("en-US",{weekday:"short"})}</span>
      <b class="${m.act?"":"pj"}">${Math.round(m.v)}</b><small class="${o.act?"":"pj"}">${Math.round(o.v)}</small>${isT&&Object.values(LV.games).some(g=>g.state==="in")?'<i class="hdlive"></i>':""}</button>`}).join("");
  const x=hDay,mi=dayInfo(h,x),oi=dayInfo(a,x),lb=new Date(x+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});
  const mv=val(h,x).v,ov=val(a,x).v,act=mi.actual!=null;
  const side=hSide==="me"?h:a;
  return `<div class="hdays">
    <div class="hdhead"><span class="eyebrow">Day by day</span>${won+lost?`<span class="hdrec">Days <b class="up">${won}</b>–<b class="down">${lost}</b></span>`:""}</div>
    <div class="hdstrip" style="--n:${days.length}">${chips}</div>
    <div class="hdpanel">
      <div class="hdsum"><div><b>${lb}</b><small>${x<today?"Final":x===today?(Object.values(LV.games).some(g=>g.state!=="pre")?"Live":"Tonight"):"Projected"}</small></div>
        <div class="hdscore"><span class="${mv>=ov?"":"faint"}">${Math.round(mv)}</span><em>${act?"–":"proj"}</em><span class="${ov>mv?"":"faint"}">${Math.round(ov)}</span></div></div>
      <div class="hdtabs" role="tablist"><button type="button" data-hs="me" aria-selected="${hSide==="me"}">${esc(D.teams[h].name)}</button><button type="button" data-hs="op" aria-selected="${hSide==="op"}">${esc(D.teams[a].name)}</button></div>
      <div class="hdcols"><div class="hdcol ${hSide==="me"?"on":""}">${hdTeam(h,x)}</div><div class="hdcol ${hSide==="op"?"on":""}">${hdTeam(a,x)}</div></div>
    </div></div>`}
function renderHeroDays(){const el=$("#heroDays");if(!el||!D||!D.opp)return;el.innerHTML=heroDays(D.me,D.opp)}
document.addEventListener("click",e=>{const b=e.target.closest("[data-hd],[data-hs]");if(!b||!b.closest("#heroDays"))return;
  if(b.dataset.hd)hDay=b.dataset.hd;else hSide=b.dataset.hs;renderHeroDays()});
