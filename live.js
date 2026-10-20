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
  const bd=B.days[today];
  if(bd)for(const id of bd.start){const p=D.players.find(x=>x.id===id);const g=p&&gameOf(p);const f=g?g.f:(LV.ok?0:null);if(f==null)continue;e+=(bd.pp[id]||0)*f}
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
  if(!D||!D.opp||!$("#hero"))return;
  if(!isLiveWeek()){const el=$("#liveBox");if(el)el.innerHTML="";return}
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
  const mine=notes(me,6),theirs=notes(op,3),form=weekForm(me).filter(x=>x.g).sort((a,b)=>b.d-a.d);
  const hot=form.filter(x=>x.d>=3).slice(0,3),cold=form.filter(x=>x.d<=-3).slice(-3).reverse();
  const liveG=Object.values(LV.games).filter((g,i,a)=>a.indexOf(g)===i&&g.state==="in").length;
  $("#liveBox").innerHTML=`<div class="lvstrip">
      <div><span class="lvdot ${liveG?"on":""}"></span><b>${lead===0?"Tied":lead>0?`Up ${lead}`:`Down ${-lead}`}</b> <span class="faint">${liveG?`· ${liveG} game${liveG>1?"s":""} live`:"· live score"}</span></div>
      ${em!=null?`<div>You: ${Math.round(sm)} vs ${Math.round(em)} expected by now, ${pace(sm,em)}</div>`:""}
      ${eo!=null?`<div>${esc(T[op].name)}: ${Math.round(so)} vs ${Math.round(eo)} expected, ${pace(so,eo)}</div>`:""}
      ${bm!=null?`<div>Final projection ${Math.round(fm)} vs ${Math.round(bm)} at the start of the week (${fm-bm>=0?"+":""}${Math.round(fm-bm)})</div>`:""}
    </div>
    ${mine.length||theirs.length?`<div class="lvnotes"><div><div class="eyebrow">Your guys tonight</div><ul>${mine.map(n=>`<li>${n.t}</li>`).join("")||"<li class='faint'>None of your starters have tipped yet.</li>"}</ul></div>
      <div><div class="eyebrow">${esc(T[op].name)}</div><ul>${theirs.map(n=>`<li>${n.t}</li>`).join("")||"<li class='faint'>None of their starters have tipped yet.</li>"}</ul></div></div>`:""}
    ${hot.length||cold.length?`<div class="lvform">${hot.length?`<div><div class="eyebrow up">Beating projections this week</div>${hot.map(x=>`<span class="pill">${esc(x.n)} <span class="up">+${x.d}</span></span>`).join(" ")}</div>`:""}${cold.length?`<div><div class="eyebrow down">Falling short</div>${cold.map(x=>`<span class="pill">${esc(x.n)} <span class="down">${x.d}</span></span>`).join(" ")}</div>`:""}</div>`:""}`;
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
function dayPlayers(t,iso){
  const today=TODAY(),B=D.base&&D.base.teams[t],bd=(B&&B.days[iso])||{pp:{},start:[]},cur=(D.teams[t].daily||[]).find(x=>x.iso===iso);
  const name=id=>{const p=D.players.find(x=>x.id==id);return p?p.n:String(id)};
  let rows=[];
  if(iso<today&&(D.act||{})[iso]&&D.act[iso][t]){
    rows=D.act[iso][t].pl.map(([id,n,slot,fp])=>({n,slot,proj:bd.pp[id],act:fp,st:"Final"}));
    for(const id of bd.start)if(!rows.some(r=>r.n===name(id)))rows.push({n:name(id),slot:"–",proj:bd.pp[id],act:null,st:"dropped"});
  }else if(iso===today){
    const pp={...(bd.pp||{}),...((cur||{}).pp||{})};
    rows=P(t).filter(p=>pp[p.id]!=null).map(p=>{const g=gameOf(p),r=LV.rows[p.id];return {n:p.n,slot:p.slot,proj:pp[p.id],act:g&&g.state!=="pre"&&r&&!r.dnp?r.fp:g&&g.state==="post"?0:null,st:g?(g.state==="in"?g.detail:g.state==="post"?"Final":g.detail):""}});
  }else{
    const byName=Object.fromEntries(P(t).map(p=>[p.n,p]));const src=cur||{start:[],bench:[],pp:{}};
    rows=src.start.map(([s,n])=>({n,slot:s,proj:(byName[n]&&src.pp[byName[n].id])||(byName[n]&&byName[n].v)||0,act:null,st:""})).concat((src.bench||[]).map(n=>({n,slot:"BE",proj:(byName[n]&&src.pp[byName[n].id])||0,act:null,st:""})));
  }
  return rows.sort((a,b)=>(isBench(a.slot)-isBench(b.slot))||((b.act??b.proj??0)-(a.act??a.proj??0)));
}
function playersTbl(t,iso){
  const rows=dayPlayers(t,iso);if(!rows.length)return `<div class="faint">No games.</div>`;
  const tot=rows.filter(r=>!isBench(r.slot));
  return `<table class="tbl dtbl"><thead><tr><th>${esc(D.teams[t].name)}</th><th>Slot</th><th>Proj</th><th>Actual</th><th>+/-</th></tr></thead><tbody>
    ${rows.map(r=>{const d=r.act!=null&&r.proj!=null?r1(r.act-r.proj):null;return `<tr class="${isBench(r.slot)?"bn":""}"><td><span class="nm">${esc(r.n)}<small>${esc(r.st||"")}</small></span></td><td>${esc(r.slot)}</td><td>${r.proj!=null?r1(r.proj):"–"}</td><td class="fp">${r.act!=null?r.act:"–"}</td><td class="${d==null?"":d>=0?"up":"down"}">${d==null?"":(d>0?"+":"")+d}</td></tr>`}).join("")}
    <tr class="tt"><td>Starters</td><td></td><td>${r1(tot.reduce((s,r)=>s+(r.proj||0),0))}</td><td class="fp">${tot.some(r=>r.act!=null)?r1(tot.reduce((s,r)=>s+(r.act||0),0)):"–"}</td><td></td></tr></tbody></table>`;
}
function dayTable(h,a){
  const days=D.all_days||(D.teams[h].daily||[]).map(x=>x.iso),today=TODAY();
  const lbl=iso=>{const d=new Date(iso+"T12:00:00");return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})};
  const cell=(t,iso)=>{const x=dayInfo(t,iso);return x.actual!=null?`<span class="num">${Math.round(x.actual)}</span> <span class="faint">/ ${Math.round(x.proj)}</span>`:`<span class="num">${Math.round(x.now??x.proj)}</span> <span class="faint">· ${x.starts}</span>`};
  return `<div id="dayTbl" data-h="${h}" data-a="${a}"><div class="scroll"><table class="dayt"><thead><tr><th>Day</th><th class="r">${esc(D.teams[h].name)}</th><th class="r">${esc(D.teams[a].name)}</th></tr></thead><tbody>
    ${days.map(iso=>`<tr class="drow ${iso===today?"today":iso<today?"past":""} ${openDay===iso?"open":""}" data-iso="${iso}" tabindex="0" aria-expanded="${openDay===iso}"><td>${lbl(iso)}${iso===today?' <span class="pill" style="padding:1px 7px">Today</span>':""}</td><td class="r">${cell(h,iso)}</td><td class="r">${cell(a,iso)}</td></tr>
      ${openDay===iso?`<tr class="dsub"><td colspan="3"><div class="dsplit">${playersTbl(h,iso)}${playersTbl(a,iso)}</div></td></tr>`:""}`).join("")}
    </tbody></table></div><p class="faint" style="font-size:12px;margin:8px 0 0">Played days show actual / projected at the start of the week. Upcoming days show today's projection · starts. Tap a day for every player.</p></div>`;
}
document.addEventListener("click",e=>{const r=e.target.closest(".drow");if(!r)return;e.stopPropagation();openDay=openDay===r.dataset.iso?null:r.dataset.iso;const t=r.closest("#dayTbl");t.outerHTML=dayTable(+t.dataset.h,+t.dataset.a)},true);
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.classList&&e.target.classList.contains("drow"))e.target.click()});
liveTick();
