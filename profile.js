/* Player profile (Arena): duotone headshot in team colors, report card, season line, game log, shot chart,
   and a Claude-written summary on demand (summary.yml runs Claude Code on your Claude subscription). */
const SUMQ={};  // pending summary requests: target -> requested-at ms

function sumFile(kind,id){return `summaries/${kind}-${id}.json`}
async function loadSummary(kind,id){try{const r=await fetch(sumFile(kind,id)+"?t="+Date.now(),{cache:"no-store"});return r.ok?await r.json():null}catch(e){return null}}
const agoTxt=iso=>{const m=(Date.now()-Date.parse(iso))/60000;return m<60?Math.max(1,Math.round(m))+" min ago":m<1440?Math.round(m/60)+" hr ago":Math.round(m/1440)+" days ago"};

function summaryHTML(S,kind,id){
  const t=kind==="team"?`team:${id}`:`player:${id}:${aTeam}`,busy=SUMQ[t];
  const btn=`<button class="b ${S?"":"primary"}" type="button" data-sum="${t}" ${busy?"disabled":""}>${busy?`<span class="spin"></span> Writing… about 1 to 3 min`:S?"Refresh summary":"✦ Write a summary"}</button>`;
  if(!S)return `<div class="sumcard empty"><div><div class="eyebrow">Scouting summary</div><p class="mute" style="margin:6px 0 0">Claude reads his numbers, searches the latest news and fan takes, and writes it up.</p></div>${btn}</div>`;
  return `<div class="sumcard"><div class="row" style="align-items:center"><div class="eyebrow">Scouting summary · ${esc(agoTxt(S.at))}</div>${btn}</div>
    <p class="sumhead">${esc(S.headline)}</p>
    <div class="sumcols"><div><h4 class="up">Going well</h4><ul>${(S.good||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h4 class="down">Not working</h4><ul>${(S.bad||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>
    ${S.fans?`<h4>What people are saying</h4><p>${esc(S.fans)}</p>`:""}${S.outlook?`<h4>What to expect</h4><p>${esc(S.outlook)}</p>`:""}
    ${(S.sources||[]).length?`<div class="sumsrc">${S.sources.slice(0,6).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("")}</div>`:""}</div>`;
}

async function requestSummary(t,rerender){
  if(SUMQ[t])return;
  if(!getTok()){summaryHelp(t);return}
  SUMQ[t]=Date.now();rerender();
  try{
    const r=await gh(`/actions/workflows/summary.yml/dispatches`,{method:"POST",body:JSON.stringify({ref:"main",inputs:{target:t}})});
    if([401,403,404].includes(r.status)){setTok("");throw new Error("GitHub rejected the saved token. Tap the button again for the no-setup option.")}
    if(!r.ok)throw new Error("GitHub said "+r.status);
    const [kind,id]=t.split(":");const since=SUMQ[t];
    for(let i=0;i<50;i++){await new Promise(s=>setTimeout(s,8000));
      const S=await loadSummary(kind,id);if(S&&Date.parse(S.at)>since-120000){delete SUMQ[t];rerender();toast("Summary is ready.");return}}
    throw new Error("Still writing. It'll show up here when GitHub finishes.")
  }catch(e){delete SUMQ[t];rerender();toast(e.message)}
}
function summaryHelp(t){const m=document.createElement("div");m.className="modal";m.innerHTML=`<div class="box" role="dialog" aria-label="Write a summary"><h2 style="margin:0">Write a summary</h2>
  <p class="mute" style="margin:0;font-size:14px">This browser isn't connected to GitHub yet. Open GitHub, tap <b>Run workflow</b>, paste this, and run it:</p>
  <div class="copyrow"><code>${esc(t)}</code><button class="b" type="button" id="sumCopy">Copy</button></div>
  <a class="b primary" style="justify-content:center;text-decoration:none" href="https://github.com/${REPO}/actions/workflows/summary.yml" target="_blank" rel="noopener">Open GitHub</a>
  <p class="faint" style="margin:0;font-size:12.5px">Or connect this browser once (Force update → one-time setup) and the button runs it directly.</p>
  <button class="b" type="button" id="sumClose">Close</button></div>`;
  document.body.appendChild(m);$("#sumCopy").onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(t);toast("Copied")};
  $("#sumClose").onclick=()=>m.remove();m.addEventListener("click",e=>{if(e.target===m)m.remove()})}

/* ---------- player profile ---------- */
async function openProfile(pid){
  pid=String(pid);const p=A.players.find(x=>String(x.pid)===pid);if(!p)return;
  document.querySelector(".sheet.prof")?.remove();
  const sh=document.createElement("div");sh.className="sheet prof";sh.innerHTML=`<div class="panel" role="dialog" aria-label="${esc(p.n)}"></div>`;
  document.body.appendChild(sh);const pane=sh.querySelector(".panel");
  const close=()=>{sh.remove();document.removeEventListener("keydown",esc1)};const esc1=e=>{if(e.key==="Escape")close()};
  document.addEventListener("keydown",esc1);sh.addEventListener("click",e=>{if(e.target===sh)close()});
  let S=await loadSummary("player",pid);
  const draw=()=>{
    const G=GR[pid],T=A.team;
    const log=A.games.map(g=>({g,b:g.box.find(b=>String(b.pid)===pid)})).filter(x=>x.b).reverse();
    const shots=A.games.flatMap(g=>g.shots).filter(s=>String(s[0])===pid);
    const z={paint:[0,0],mid:[0,0],three:[0,0]};shots.forEach(s=>{const k=zoneOf(s[1],s[2],s.length>6?s[6]===1:null);z[k][1]++;if(s[3])z[k][0]++});
    const dots=shots.map(s=>{const x=s[1]*10,y=(s[2]+5.25)*10;return s[3]?`<circle cx="${x}" cy="${y}" r="7" class="mk"/>`:`<path d="M${x-5} ${y-5}L${x+5} ${y+5}M${x+5} ${y-5}L${x-5} ${y+5}" class="ms"/>`}).join("");
    const tile=(l,v)=>`<div><span>${l}</span><b class="num">${v}</b></div>`;
    pane.innerHTML=`<button class="x" type="button" aria-label="Close">✕</button>
      <div class="phero">
        <div class="duo" style="--c1:${esc(T.color)};--c2:${esc(T.alt)}"><img src="${esc(p.hs)}" alt="" onerror="this.style.display='none'"></div>
        <div style="min-width:0"><div class="eyebrow">${esc(T.name)} · ${esc(p.pos||"")}</div><h2 class="pname">${esc(p.n)}</h2>
          ${G?`<div class="gwhy" style="margin:8px 0 0">${gradeTag(pid)} <span>${esc(G.why.join(" · ")||"solid all around")}</span></div>`:""}
          <div class="faint" style="font-size:13px;margin-top:6px">${p.gp} games · ${p.gs||0} starts · ${p.min} min a game</div></div>
      </div>
      <div id="pSum">${summaryHTML(S,"player",pid)}</div>
      <div class="ptiles">${tile("PTS",p.pts)}${tile("REB",p.reb)}${tile("AST",p.ast)}${tile("STL",p.stl)}${tile("BLK",p.blk)}${tile("TO",p.to)}
        ${tile("FG%",pct(p.fg))}${tile("3P%",pct(p.tp))}${tile("FT%",pct(p.ft))}${tile("TS%",pct(p.ts))}${tile("USG",pct(p.usg))}${tile("+/-",sign(+(+p.pm).toFixed(1)))}</div>
      <div class="ptwo">
        <div><div class="eyebrow" style="margin-bottom:8px">Shots · last ${A.games.length} games</div>
          <svg class="court" viewBox="0 0 500 470" role="img" aria-label="Shot chart">${courtSVG()}${dots}</svg>
          <div class="zones">${[["paint","Paint"],["mid","Mid"],["three","Three"]].map(([k,l])=>`<div><span class="faint">${l}</span><b class="num">${z[k][1]?Math.round(100*z[k][0]/z[k][1])+"%":"–"}</b><span class="faint num" style="font-size:11.5px">${z[k][0]}/${z[k][1]}</span></div>`).join("")}</div></div>
        <div><div class="eyebrow" style="margin-bottom:8px">Game log</div><div class="scroll"><table class="tbl plog"><thead><tr><th>Game</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>+/-</th></tr></thead><tbody>
          ${log.map(({g,b})=>`<tr><td><span class="nm">${cday(g.date)} ${g.home?"vs":"@"} ${esc(g.opp)}<small class="${g.res==="W"?"up":"down"}">${g.res} ${g.us}-${g.them}</small></span></td><td>${b.min}</td><td><b>${b.pts}</b></td><td>${b.reb}</td><td>${b.ast}</td><td>${b.fgm}-${b.fga}</td><td class="${b.pm>0?"up":b.pm<0?"down":""}">${sign(b.pm)}</td></tr>`).join("")}</tbody></table></div></div>
      </div>
      <p class="faint" style="font-size:12px;margin:4px 0 0">Advanced offense and defense breakdowns coming later.</p>`;
    pane.querySelector(".x").onclick=close;
    pane.querySelectorAll("[data-sum]").forEach(b=>b.onclick=()=>requestSummary(b.dataset.sum,async()=>{S=await loadSummary("player",pid);if(sh.isConnected)draw()}));
  };
  draw();
}

/* ---------- team summary (Arena hero) ---------- */
async function openTeamSummary(){
  const abbr=aTeam;document.querySelector(".sheet.prof")?.remove();
  const sh=document.createElement("div");sh.className="sheet prof";sh.innerHTML=`<div class="panel" role="dialog" aria-label="Team summary"></div>`;document.body.appendChild(sh);
  const pane=sh.querySelector(".panel"),close=()=>sh.remove();sh.addEventListener("click",e=>{if(e.target===sh)close()});
  let S=await loadSummary("team",abbr);
  const draw=()=>{const T=A.team;pane.innerHTML=`<button class="x" type="button" aria-label="Close">✕</button>
    <div class="phero"><div class="duo team" style="--c1:${esc(T.color)};--c2:${esc(T.alt)}"><img src="${esc(T.logo)}" alt=""></div><div><div class="eyebrow">${esc(T.conf||"")} · ${esc(T.record||"")}</div><h2 class="pname">${esc(T.name)}</h2></div></div>
    <div id="pSum">${summaryHTML(S,"team",abbr)}</div>`;
    pane.querySelector(".x").onclick=close;
    pane.querySelectorAll("[data-sum]").forEach(b=>b.onclick=()=>requestSummary(b.dataset.sum,async()=>{S=await loadSummary("team",abbr);if(sh.isConnected)draw()}))};
  draw();
}

/* open a profile from the Impact list or any box-score name */
document.addEventListener("click",e=>{
  const n=e.target.closest("[data-prof]");if(n){e.preventDefault();e.stopPropagation();openProfile(n.dataset.prof);return}
  const ts=e.target.closest("#aTeamSum");if(ts){openTeamSummary()}
},true);
