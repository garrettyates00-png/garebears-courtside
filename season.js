/* Season tab (inside Arena): live NBA scoreboard with fantasy points and owners, plus season averages.
   Scores come straight from ESPN in the browser; if that's blocked, it falls back to arena/scoreboard.json
   (written by the Arena workflow). Owners and averages come from data.json / season.json. */
let sLim=50,SB=null, SBday=0, SBopen=null, SEA=null, sSort="fp", sFil="all", sQ="", sTimer=null, sDirect=true;
const SBASE="https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const SUB_K="grindex-asub";

/* ---------- sub-tab switching ---------- */
function setSub(v){
  const season=v==="season";
  $("#aSeasonPane").hidden=!season;$("#aTeamPane").hidden=season;
  document.querySelectorAll(".asub [data-sub]").forEach(b=>b.setAttribute("aria-selected",b.dataset.sub===v));
  try{localStorage.setItem(SUB_K,v)}catch(e){}
  if(season&&document.body.dataset.view==="arena")loadSeason();else stopSeason();
}
document.querySelector(".asub").addEventListener("click",e=>{const b=e.target.closest("[data-sub]");if(b)setSub(b.dataset.sub)});
(()=>{let v="team";try{v=localStorage.getItem(SUB_K)||"team"}catch(e){}if(location.hash==="#season")v="season";
  // apply once Arena opens
  setSub(v);
  new MutationObserver(()=>{if(document.body.dataset.view==="arena"&&!$("#aSeasonPane").hidden)loadSeason();else if(document.body.dataset.view!=="arena")stopSeason()}).observe(document.body,{attributes:true,attributeFilter:["data-view"]});
})();
function stopSeason(){if(sTimer){clearTimeout(sTimer);sTimer=null}}

/* ---------- owners + fantasy scoring ---------- */
function owners(){const m={};if(typeof D!=="undefined"&&D)for(const p of D.players||[])m[p.id]=p.t;if(SEA)for(const p of SEA.players)if(p.o&&!m[p.id])m[p.id]=p.o;return m}
function teamName(t){if(!t)return "";const tt=(typeof D!=="undefined"&&D&&D.teams&&D.teams[t])||null;return tt?tt.name:(SEA&&SEA.teams&&SEA.teams[t])||("Team "+t)}
function otag(t){if(!t)return '<span class="otag fa">FA</span>';const me=typeof D!=="undefined"&&D&&+t===+D.me,op=typeof D!=="undefined"&&D&&+t===+D.opp;
  return `<span class="otag ${me?"me":op?"op":""}" title="${esc(teamName(t))}">${me?"Yours":esc(teamName(t))}</span>`}
function fpts(r){
  const S=(typeof D!=="undefined"&&D&&D.scoring)||{"0":1,"1":4,"2":4,"3":2,"4":1,"6":1,"11":-2,"13":2,"14":-1,"15":1,"16":-1,"17":1,"37":5,"38":7,"39":10};
  const v={0:r.pts,1:r.blk,2:r.stl,3:r.ast,4:r.oreb,5:r.reb-r.oreb,6:r.reb,11:r.to,13:r.fgm,14:r.fga,15:r.ftm,16:r.fta,17:r.tpm,18:r.tpa};
  let f=0;for(const k in v)f+=(S[k]||0)*(v[k]||0);
  const tens=[r.pts,r.reb,r.ast,r.stl,r.blk].filter(x=>x>=10).length;
  if(tens>=4)f+=S["39"]||0;else if(tens===3)f+=S["38"]||0;else if(tens===2)f+=S["37"]||0;
  return Math.round(f*10)/10;
}

/* ---------- ESPN -> normalized games ---------- */
const ma=s=>{const [m,a]=String(s||"0-0").split("-").map(Number);return [m||0,a||0]};
function normBox(j){
  const out=[];
  for(const tp of (j.boxscore&&j.boxscore.players)||[]){
    const tm=(tp.team&&tp.team.abbreviation)||"";
    for(const st of tp.statistics||[]){
      const L=(st.labels||st.names||[]).map(x=>String(x).toUpperCase());const ix=k=>L.indexOf(k);
      for(const a of st.athletes||[]){
        const s=a.stats||[];const g=k=>{const i=ix(k);return i<0?null:s[i]};
        if(a.didNotPlay||!s.length){out.push({id:+a.athlete.id,n:a.athlete.displayName,tm,dnp:true,why:a.reason||"DNP"});continue}
        const [fgm,fga]=ma(g("FG")),[tpm,tpa]=ma(g("3PT")),[ftm,fta]=ma(g("FT"));
        const r={id:+a.athlete.id,n:a.athlete.displayName,tm,starter:!!a.starter,min:+g("MIN")||0,pts:+g("PTS")||0,reb:+g("REB")||0,oreb:+g("OREB")||0,
          ast:+g("AST")||0,stl:+g("STL")||0,blk:+g("BLK")||0,to:+g("TO")||0,pf:+g("PF")||0,pm:g("+/-")||"",fgm,fga,tpm,tpa,ftm,fta};
        r.fp=fpts(r);out.push(r);
      }
    }
  }
  return out;
}
function normGame(e){
  const c=e.competitions[0],st=e.status||c.status||{},ty=st.type||{};
  const side=h=>{const x=c.competitors.find(y=>y.homeAway===h)||{};const t=x.team||{};return {abbr:t.abbreviation,name:t.displayName,short:t.shortDisplayName||t.name,logo:t.logo||(t.logos&&t.logos[0]&&t.logos[0].href)||"",score:x.score!=null&&x.score!==""?+x.score:null,rec:(x.records&&x.records[0]&&x.records[0].summary)||""}};
  return {id:e.id,date:e.date,state:ty.state||"pre",detail:ty.shortDetail||ty.detail||"",home:side("home"),away:side("away"),tv:((c.broadcasts||[])[0]||{}).names?.join(", ")||""};
}
function dayStr(off){const d=new Date(Date.now()+off*864e5);const c=new Date(d.toLocaleString("en-US",{timeZone:"America/Chicago"}));return `${c.getFullYear()}${String(c.getMonth()+1).padStart(2,"0")}${String(c.getDate()).padStart(2,"0")}`}

async function getJSON(u){const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(r.status);return r.json()}
async function loadBoard(){
  const d=dayStr(SBday);
  if(sDirect){
    try{
      const j=await getJSON(`${SBASE}/scoreboard?dates=${d}&limit=30`);
      const games=(j.events||[]).map(normGame);
      const need=games.filter(g=>g.state!=="pre");
      const boxes=await Promise.all(need.map(g=>(SB&&SB.d===d&&SB.box[g.id]&&g.state==="post"&&SB.box[g.id].final)?SB.box[g.id]:getJSON(`${SBASE}/summary?event=${g.id}`).then(x=>({rows:normBox(x),final:g.state==="post"})).catch(()=>null)));
      const box={};need.forEach((g,i)=>{if(boxes[i])box[g.id]=boxes[i]});
      SB={d,games,box,src:"live",at:new Date()};return;
    }catch(e){sDirect=false}
  }
  try{const j=await getJSON("arena/scoreboard.json?t="+Date.now());
    const day=(j.days||{})[d];SB={d,games:day?day.games:[],box:day?Object.fromEntries(Object.entries(day.box||{}).map(([k,v])=>[k,{rows:v.map(r=>({...r,fp:fpts(r)})),final:true}])):{},src:"cache",at:j.pulled}}
  catch(e){SB={d,games:[],box:{},src:"none"}}
}
async function loadSeasonAvg(){if(SEA)return;try{SEA=await getJSON("season.json?t="+Date.now())}catch(e){SEA={players:[],teams:{}}}}

async function loadSeason(){
  stopSeason();
  if(!$("#sBoard").innerHTML)$("#sBoard").innerHTML='<div class="mute">Loading tonight\'s games…</div>';
  await Promise.all([loadBoard(),loadSeasonAvg()]);
  renderSeason();if(typeof D==="undefined"||!D)setTimeout(renderSeason,2500);
  const live=SB&&SB.games.some(g=>g.state==="in");
  if(document.body.dataset.view==="arena"&&!$("#aSeasonPane").hidden)sTimer=setTimeout(loadSeason,live&&SB.src==="live"?30000:180000);
}

/* ---------- render ---------- */
function renderSeason(){sMine();sBoard();sAvg()}
const DAYS=[[-1,"Yesterday"],[0,"Today"],[1,"Tomorrow"]];
function allRows(){const out=[];if(!SB)return out;for(const g of SB.games){const b=SB.box[g.id];if(b)for(const r of b.rows)if(!r.dnp)out.push({...r,g})}return out}

function sMine(){
  const O=owners(),rows=allRows(),me=typeof D!=="undefined"&&D?D.me:null,opp=typeof D!=="undefined"&&D?D.opp:null;
  const mine=rows.filter(r=>+O[r.id]===+me).sort((a,b)=>b.fp-a.fp),theirs=rows.filter(r=>opp&&+O[r.id]===+opp);
  const tot=a=>Math.round(a.reduce((s,r)=>s+r.fp,0)*10)/10;
  const lbl=SBday===0?"tonight":SBday<0?"yesterday":"tomorrow";
  const sched=(typeof D!=="undefined"&&D?D.players.filter(p=>+p.t===+me):[]).filter(p=>SB&&SB.games.some(g=>[g.home.abbr,g.away.abbr].includes(p.tm))&&!mine.some(r=>r.id===p.id));
  $("#sMine").innerHTML=`<div class="sec-h"><div><div class="eyebrow">Fantasy · ${lbl}</div><h2>Your players</h2></div>
    <div class="stot"><span class="pill">You ${tot(mine)}</span>${opp?`<span class="pill">${esc(teamName(opp))} ${tot(theirs)}</span>`:""}</div></div>
    ${mine.length||sched.length?`<div class="mrow">${mine.map(r=>`<div class="mp ${r.g.state==="in"?"live":""}"><div class="t"><span>${esc(r.n)}</span><b>${r.fp}</b></div>
      <div class="l">${r.pts} pts · ${r.reb} reb · ${r.ast} ast${r.stl?` · ${r.stl} stl`:""}${r.blk?` · ${r.blk} blk`:""}</div>
      <div class="l">${esc(r.tm)} · ${r.g.state==="in"?esc(r.g.detail):r.g.state==="post"?"Final":""} · ${r.min} min</div></div>`).join("")}
      ${sched.map(p=>{const g=SB.games.find(g=>[g.home.abbr,g.away.abbr].includes(p.tm));return `<div class="mp"><div class="t"><span>${esc(p.n)}</span><b class="faint">–</b></div><div class="l">${esc(p.tm)} · ${g.state==="pre"?esc(g.detail):g.state==="post"?"did not play":"no stats yet"}</div></div>`}).join("")}</div>`
      :`<div class="mute">None of your players ${SBday>0?"play":"played"} ${lbl}.</div>`}`;
}

function gameOwners(g,O){const b=SB.box[g.id];if(!b||typeof D==="undefined"||!D)return "";let m=0,o=0;for(const r of b.rows){if(r.dnp)continue;if(+O[r.id]===+D.me)m+=r.fp;else if(+O[r.id]===+D.opp)o+=r.fp}
  return m||o?`<span class="own">You ${Math.round(m*10)/10}${D.opp?` · Opp ${Math.round(o*10)/10}`:""}</span>`:""}
function sBoard(){
  const O=owners();if(!SB)return;
  const g=SB.games;
  $("#sBoard").innerHTML=`<div class="sec-h"><div><div class="eyebrow">NBA · ${SB.src==="live"?"live from ESPN":SB.src==="cache"?"updated "+esc(SB.at||""):"unavailable"}</div><h2>Scoreboard</h2></div>
    <div class="sday">${DAYS.map(([o,l])=>`<button type="button" class="fchip" data-off="${o}" aria-selected="${o===SBday}">${l}</button>`).join("")}</div></div>
    ${g.length?`<div class="sgames">${g.map(x=>{const hs=x.home.score,as=x.away.score,done=x.state==="post";
      const row=(t,sc,lose)=>`<div class="tr ${lose?"lose":""}"><img src="${esc(t.logo)}" alt="" loading="lazy"><span>${esc(t.short||t.abbr)} <small class="faint">${esc(t.rec)}</small></span><b>${sc??""}</b></div>`;
      return `<button type="button" class="lgm ${SBopen===x.id?"sel":""}" data-g="${x.id}" aria-expanded="${SBopen===x.id}">${row(x.away,as,done&&as<hs)}${row(x.home,hs,done&&hs<as)}
        <div class="st">${x.state==="in"?`<span class="live">${esc(x.detail)}</span>`:`<span>${esc(x.state==="pre"?x.detail.replace(/ - /," · "):x.detail)}</span>`}${gameOwners(x,O)}</div></button>`}).join("")}</div>`
      :`<div class="mute">No NBA games ${SBday===0?"today":SBday<0?"yesterday":"tomorrow"}.</div>`}
    <div id="sBox"></div>`;
  $("#sBoard").querySelector(".sday").onclick=e=>{const b=e.target.closest("[data-off]");if(b){SBday=+b.dataset.off;SBopen=null;SB=null;$("#sBoard").innerHTML='<div class="mute">Loading…</div>';loadSeason()}};
  $("#sBoard").querySelectorAll(".lgm").forEach(b=>b.onclick=()=>{SBopen=SBopen===b.dataset.g?null:b.dataset.g;sBoard()});
  sBox();
}
const BXCOLS=[["min","MIN"],["pts","PTS"],["reb","REB"],["ast","AST"],["stl","STL"],["blk","BLK"],["tpm","3PM"],["to","TO"]];
function sBox(){
  const el=$("#sBox");if(!el||!SBopen)return;const g=SB.games.find(x=>x.id===SBopen),b=SB.box[SBopen];
  if(!g)return;if(!b){el.innerHTML=`<div class="bx"><div class="mute">${g.state==="pre"?"Box score starts at tip-off.":"Box score not available yet."}</div></div>`;return}
  const O=owners();
  const team=t=>{const rows=b.rows.filter(r=>r.tm===t.abbr);const played=rows.filter(r=>!r.dnp).sort((a,c)=>c.fp-a.fp),dnp=rows.filter(r=>r.dnp);
    return `<div><h3><img src="${esc(t.logo)}" alt="">${esc(t.name)} <span class="faint num">${t.score??""}</span></h3><div class="tscroll"><table class="tbl"><thead><tr><th>Player</th><th>Owner</th>${BXCOLS.map(c=>`<th>${c[1]}</th>`).join("")}<th>FG</th><th>FT</th><th>+/-</th><th>FPTS</th></tr></thead><tbody>
    ${played.map(r=>{const o=O[r.id];const cls=typeof D!=="undefined"&&D&&+o===+D.me?"mine":typeof D!=="undefined"&&D&&+o===+D.opp?"opp":"";
      return `<tr class="${cls}"><td><span class="nm">${esc(r.n)}<small>${r.starter?"Starter":"Bench"}</small></span></td><td style="text-align:left">${otag(o)}</td>${BXCOLS.map(c=>`<td>${r[c[0]]}</td>`).join("")}<td>${r.fgm}-${r.fga}</td><td>${r.ftm}-${r.fta}</td><td>${esc(r.pm)}</td><td class="fp">${r.fp}</td></tr>`}).join("")}
    ${dnp.length?`<tr><td colspan="${BXCOLS.length+6}" class="faint" style="text-align:left;white-space:normal">Did not play: ${dnp.map(r=>esc(r.n)).join(", ")}</td></tr>`:""}</tbody></table></div></div>`};
  el.innerHTML=`<div class="bx">${team(g.away)}${team(g.home)}</div>`;
}

const AVCOLS=[["gp","GP"],["min","MIN"],["pts","PTS"],["reb","REB"],["ast","AST"],["stl","STL"],["blk","BLK"],["tpm","3PM"],["to","TO"],["fg","FG%"],["ft","FT%"],["fp","FPTS/G"],["fpt","FPTS"]];
function sAvg(){
  const el=$("#sAvg");if(!SEA)return;
  const O=owners(),me=typeof D!=="undefined"&&D?D.me:null,opp=typeof D!=="undefined"&&D?D.opp:null;
  if(!SEA.players.length){el.innerHTML=`<div class="eyebrow">Season ${SEA.season?SEA.season-1+"-"+String(SEA.season).slice(2):""}</div><h2>Player averages</h2><p class="mute">Averages show up after each player's first game. They refresh every 30 minutes.</p>`;return}
  const fil=[["all","All"],["me","Your team"],["opp","Opponent"],["fa","Free agents"],["owned","Rostered"]];
  let rows=SEA.players.map(p=>({...p,o:O[p.id]||0}));
  if(sFil==="me")rows=rows.filter(r=>+r.o===+me);else if(sFil==="opp")rows=rows.filter(r=>+r.o===+opp);else if(sFil==="fa")rows=rows.filter(r=>!r.o);else if(sFil==="owned")rows=rows.filter(r=>r.o);
  if(sQ){const q=sQ.toLowerCase();rows=rows.filter(r=>r.n.toLowerCase().includes(q)||r.tm.toLowerCase().includes(q)||teamName(r.o).toLowerCase().includes(q))}
  rows.sort((a,b)=>(b[sSort]??-1)-(a[sSort]??-1));
  const shown=rows.slice(0,sLim);
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Per game · updated ${esc(SEA.pulled||"")}</div><h2>Player averages</h2></div></div>
    <div class="sfil"><input type="search" id="sQ" placeholder="Search players, NBA team or fantasy team" value="${esc(sQ)}" aria-label="Search players">
      ${fil.map(([k,l])=>`<button type="button" class="fchip" data-f="${k}" aria-selected="${k===sFil}">${l}</button>`).join("")}</div>
    <div class="tscroll"><table class="tbl"><thead><tr><th>Player</th><th>Owner</th>${AVCOLS.map(([k,l])=>`<th class="sort ${k===sSort?"on":""}" data-k="${k}" tabindex="0">${l}</th>`).join("")}</tr></thead><tbody>
    ${shown.map(r=>`<tr class="${+r.o===+me?"mine":opp&&+r.o===+opp?"opp":""}"><td><span class="nm">${esc(r.n)}<small>${esc(r.tm)} · ${esc(r.pos)}${r.inj?` · ${esc(r.inj.replace("_"," ").toLowerCase())}`:""}</small></span></td><td style="text-align:left">${otag(r.o)}</td>
      ${AVCOLS.map(([k])=>`<td class="${k==="fp"?"fp":""}">${r[k]==null?"–":r[k]}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${AVCOLS.length+2}" class="mute" style="text-align:left">No players match.</td></tr>`}
    </tbody></table></div>${rows.length>sLim?`<div style="margin-top:12px;display:flex;gap:10px;align-items:center"><button type="button" class="b" id="sMore">Show 50 more</button><span class="faint" style="font-size:12.5px">${sLim} of ${rows.length}</span></div>`:""}`;
  const mo=$("#sMore");if(mo)mo.onclick=()=>{sLim+=50;sAvg()};
  const q=$("#sQ");q.oninput=e=>{sQ=e.target.value;const pos=e.target.selectionStart;sAvg();const n=$("#sQ");n.focus();n.setSelectionRange(pos,pos)};
  el.querySelector(".sfil").onclick=e=>{const b=e.target.closest("[data-f]");if(b){sFil=b.dataset.f;sLim=50;sAvg()}};
  el.querySelectorAll("th.sort").forEach(th=>{const go=()=>{sSort=th.dataset.k;sAvg()};th.onclick=go;th.onkeydown=e=>{if(e.key==="Enter")go()}});
}
