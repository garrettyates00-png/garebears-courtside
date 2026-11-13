/* Player profile (Arena): duotone headshot in team colors, report card, season line, game log, shot chart,
   and a Claude-written summary on demand (summary.yml runs Claude Code on your Claude subscription). */
const SUMQ={};  // pending summary requests: target -> requested-at ms

function sumFile(kind,id){return `summaries/${kind}-${id}.json`}
async function loadSummary(kind,id){try{const r=await fetch(sumFile(kind,id)+"?t="+Date.now(),{cache:"no-store"});return r.ok?await r.json():null}catch(e){return null}}
const agoTxt=iso=>{const m=(Date.now()-Date.parse(iso))/60000;return m<60?Math.max(1,Math.round(m))+" min ago":m<1440?Math.round(m/60)+" hr ago":Math.round(m/1440)+" days ago"};

function summaryHTML(S,kind,id){
  const t=kind==="team"?`team:${id}`:`player:${id}:${aTeam}`,busy=SUMQ[t];
  const btn=`<button class="b ${S?"":"primary"}" type="button" data-sum="${t}" ${busy?"disabled":""}>${busy?`<span class="spin"></span> Writing… about 1 to 3 min`:S?"Refresh summary":"✦ Write a summary"}</button>`;
  const setup=`<button type="button" class="linkbtn" onclick="claudeSetup('missing')">First time? Connect your Claude plan</button>`;
  if(!S)return `<div class="sumcard empty"><div><div class="eyebrow">Scouting summary</div><p class="mute" style="margin:6px 0 0">Claude reads ${kind==="team"?"the team's":"his"} numbers, searches the latest news and fan takes, and writes it up.</p>${setup}</div>${btn}</div>`;
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
      const S=await loadSummary(kind,id);if(S&&Date.parse(S.at)>since-120000){delete SUMQ[t];rerender();toast("Summary is ready.");return}
      if(i%2===1){const why=await summaryFailure(since);if(why)throw new Error(why)}}
    throw new Error("Still writing. It'll show up here when GitHub finishes.")
  }catch(e){delete SUMQ[t];rerender();toast(e.message)}
}
/* if the GitHub run failed, say which step failed */
async function summaryFailure(since){try{
  const runs=await (await gh(`/actions/workflows/summary.yml/runs?per_page=3&created=>=${new Date(since-60000).toISOString()}`)).json();
  const run=(runs.workflow_runs||[]).find(r=>r.conclusion==="failure");if(!run)return null;
  const jobs=await (await gh(`/actions/runs/${run.id}/jobs`)).json();
  const step=((jobs.jobs||[])[0]?.steps||[]).find(s=>s.conclusion==="failure");const n=step?step.name:"";
  if(n==="Check the Claude token"){claudeSetup("missing");return "The Claude token isn't set up yet. Follow the steps that just opened."}
  if(n.includes("anthropics")||n.includes("claude-code-action")){claudeSetup("bad");return "Claude couldn't run. Check the steps that just opened."}
  return n==="Check the Claude token"?"":
    n==="Check the request"?"No Arena data for that team yet, so there's nothing to summarize.":
    n.includes("claude-code-action")||n.includes("anthropics")?"Claude couldn't run. The token may be wrong or expired, or you've hit your Pro usage limit for now.":
    n==="Publish"?"Claude ran but didn't produce a summary file. Try again.":`The summary failed on GitHub${n?` at "${n}"`:""}.`}catch(e){return null}}
/* step-by-step guide for the one-time Claude token (created on your computer, pasted into GitHub) */
function claudeSetup(why){document.querySelector(".modal.csetup")?.remove();const m=document.createElement("div");m.className="modal csetup";
  const cmd=(c)=>`<div class="copyrow"><code>${esc(c)}</code><button class="b" type="button" data-copy="${esc(c)}">Copy</button></div>`;
  m.innerHTML=`<div class="box" role="dialog" aria-label="Connect your Claude plan" style="max-width:560px">
    <h2 style="margin:0">${why==="bad"?"Claude couldn't run":"Connect your Claude plan"}</h2>
    <p class="mute" style="margin:0;font-size:14px">${why==="bad"?"The run reached Claude but was turned away. Usually the token is wrong or expired, or your Pro usage limit is used up for now (then just wait and try later). To redo the token:":"Summaries run on your Claude Pro plan. That needs a one-time token that only your computer can create. About 5 minutes:"}</p>
    <ol class="csteps">
      <li>On your computer, open <b>PowerShell</b> and install Claude Code:${cmd("irm https://claude.ai/install.ps1 | iex")}</li>
      <li>Close and reopen PowerShell, then run:${cmd("claude setup-token")}A browser opens. Sign in with your Claude Pro account and approve.</li>
      <li>Copy the long token PowerShell prints.</li>
      <li>On GitHub, add a secret with this name and paste the token as its value:${cmd("CLAUDE_CODE_OAUTH_TOKEN")}
        <a class="b primary" style="justify-content:center;text-decoration:none;margin-top:6px" href="https://github.com/${REPO}/settings/secrets/actions/new" target="_blank" rel="noopener">Open GitHub secrets</a></li>
      <li>Come back and tap <b>Write a summary</b> again.</li>
    </ol>
    <button class="b" type="button" id="csClose">Close</button></div>`;
  document.body.appendChild(m);m.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy);b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1500)});
  $("#csClose").onclick=()=>m.remove();m.addEventListener("click",e=>{if(e.target===m)m.remove()})}
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
  let pMode=typeof aShotMode!=="undefined"?aShotMode:"shots";
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
        <div><div class="row" style="margin-bottom:8px"><div class="eyebrow">Shots · last ${A.games.length} games</div>
          <div class="shmode" role="tablist" aria-label="Chart type" style="margin:0"><button type="button" class="fchip" data-pm="shots" aria-selected="${pMode==="shots"}">Shots</button><button type="button" class="fchip" data-pm="zones" aria-selected="${pMode==="zones"}">Zones</button></div></div>
          ${pMode==="zones"?zoneChartHTML(zoneStats(shots)):`<svg class="court" viewBox="0 0 500 470" role="img" aria-label="Shot chart">${courtSVG()}${dots}</svg>`}
          <div class="zones">${[["paint","Paint"],["mid","Mid"],["three","Three"]].map(([k,l])=>`<div><span class="faint">${l}</span><b class="num">${z[k][1]?Math.round(100*z[k][0]/z[k][1])+"%":"–"}</b><span class="faint num" style="font-size:11.5px">${z[k][0]}/${z[k][1]}</span></div>`).join("")}</div></div>
        <div><div class="eyebrow" style="margin-bottom:8px">Game log</div><div class="scroll"><table class="tbl plog"><thead><tr><th>Game</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>+/-</th></tr></thead><tbody>
          ${log.map(({g,b})=>`<tr><td><span class="nm">${cday(g.date)} ${g.home?"vs":"@"} ${esc(g.opp)}<small class="${g.res==="W"?"up":"down"}">${g.res} ${g.us}-${g.them}</small></span></td><td>${b.min}</td><td><b>${b.pts}</b></td><td>${b.reb}</td><td>${b.ast}</td><td>${b.fgm}-${b.fga}</td><td class="${b.pm>0?"up":b.pm<0?"down":""}">${sign(b.pm)}</td></tr>`).join("")}</tbody></table></div></div>
      </div>
      <div class="eyebrow" style="margin:18px 0 8px">Advanced</div>${advHTML(pid)}`;
    pane.querySelector(".x").onclick=close;
    pane.querySelectorAll("[data-sum]").forEach(b=>b.onclick=()=>requestSummary(b.dataset.sum,async()=>{S=await loadSummary("player",pid);if(sh.isConnected)draw()}));
    pane.querySelectorAll("[data-pm]").forEach(b=>b.onclick=()=>{pMode=b.dataset.pm;const st=pane.scrollTop;draw();pane.scrollTop=st});
    const zc=pane.querySelector(".zcv");if(zc)drawZones(zc,zoneStats(shots));
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

/* ---------- advanced offense / defense (player profile) ----------
   Built from every box score in the last games: the player's line, his team's totals and the opponent's totals for
   each game he played, summed minutes-weighted. Formulas follow Basketball-Reference (usage, assist %, rebound %,
   steal % and block % are shares of what was available while he was on the floor). The bar under each number runs
   from a low to a high typical NBA value, with a tick at league average. */
function advStats(pid){
  const sum=a=>a.reduce((s,b)=>s+(+b||0),0),poss=b=>sum(b.map(x=>x.fga))-sum(b.map(x=>x.oreb))+sum(b.map(x=>x.to))+.44*sum(b.map(x=>x.fta));
  const r={mp:0,fga:0,fgm:0,tpa:0,tpm:0,fta:0,ftm:0,pts:0,ast:0,to:0,stl:0,blk:0,pf:0,oreb:0,dreb:0,pm:0,
    use:0,useD:0,astD:0,orD:0,drD:0,stD:0,bkD:0,dpts:0,dposs:0,gp:0,rim:0,mid:0,thr:0,shots:0};
  for(const g of A.games){const b=g.box.find(x=>String(x.pid)===pid);if(!b||!b.min)continue;const T=g.box,O=g.obox||[];if(!O.length)continue;
    const tmp=sum(T.map(x=>x.min))||240,f=b.min/(tmp/5);
    for(const k of["fga","fgm","tpa","tpm","fta","ftm","pts","ast","to","stl","blk","pf","oreb","dreb","pm"])r[k]+=+b[k]||0;
    r.mp+=b.min;r.gp++;
    r.useD+=f*(sum(T.map(x=>x.fga))+.44*sum(T.map(x=>x.fta))+sum(T.map(x=>x.to)));
    r.astD+=f*sum(T.map(x=>x.fgm))-b.fgm;
    r.orD+=f*(sum(T.map(x=>x.oreb))+sum(O.map(x=>x.dreb)));
    r.drD+=f*(sum(T.map(x=>x.dreb))+sum(O.map(x=>x.oreb)));
    const op=poss(O);r.stD+=f*op;r.bkD+=f*(sum(O.map(x=>x.fga))-sum(O.map(x=>x.tpa)));
    r.dpts+=f*g.them;r.dposs+=f*op;   // team defense, weighted by his share of the minutes
    for(const s of g.shots.filter(s=>String(s[0])===pid)){const z=zone14(s[1],s[2],s.length>6?s[6]===1:null);r.shots++;if(z==="ra")r.rim++;else if(/^(c3|w3|t3|deep)/.test(z))r.thr++;else if(z!=="paint")r.mid++}}
  if(!r.gp||r.mp<20)return null;
  const per36=v=>v/r.mp*36,tsa=r.fga+.44*r.fta;
  return {gp:r.gp,
    off:[["TS%","True shooting: points per shot, free throws included",tsa?r.pts/(2*tsa):null,.50,.575,.66,"pct"],
      ["eFG%","Field goal % with threes worth 1.5",r.fga?(r.fgm+.5*r.tpm)/r.fga:null,.46,.54,.62,"pct"],
      ["USG%","Share of team plays he finishes while on the floor",r.useD?(r.fga+.44*r.fta+r.to)/r.useD:null,.12,.20,.33,"pct"],
      ["AST%","Share of teammates' baskets he assisted while on the floor",r.astD>0?r.ast/r.astD:null,.05,.15,.40,"pct"],
      ["TOV%","Turnovers per play he finishes (lower is better)",tsa+r.to?r.to/(tsa+r.to):null,.18,.12,.07,"pct"],
      ["AST/TO","Assists per turnover",r.to?r.ast/r.to:r.ast?r.ast:null,.8,1.8,3.5,"x"],
      ["FT rate","Free throw attempts per shot",r.fga?r.fta/r.fga:null,.10,.25,.45,"x2"],
      ["ORB%","Offensive rebounds grabbed of those available",r.orD?r.oreb/r.orD:null,.01,.05,.13,"pct"]],
    diet:r.shots?{rim:r.rim/r.shots,mid:r.mid/r.shots,thr:r.thr/r.shots,n:r.shots}:null,
    def:[["DRB%","Defensive rebounds grabbed of those available",r.drD?r.dreb/r.drD:null,.08,.15,.28,"pct"],
      ["STL%","Opponent possessions ending in his steal",r.stD?r.stl/r.stD:null,.005,.015,.03,"pct"],
      ["BLK%","Opponent two-point tries he blocked",r.bkD?r.blk/r.bkD:null,.002,.015,.06,"pct"],
      ["Stocks/36","Steals plus blocks per 36 minutes",per36(r.stl+r.blk),.6,1.8,3.5,"x"],
      ["Fouls/36","Personal fouls per 36 minutes (lower is better)",per36(r.pf),5,3.2,1.8,"x"],
      ["DRtg (team)","Opponent points per 100 possessions in his minutes (lower is better)",r.dposs?100*r.dpts/r.dposs:null,122,114,104,"x1"],
      ["+/- per 36","Score margin while he's on the floor",per36(r.pm),-10,0,10,"pm"]]};
}
function advHTML(pid){
  const S=advStats(pid);if(!S)return `<p class="faint" style="font-size:12.5px">Not enough minutes yet for advanced numbers.</p>`;
  const fmt=(v,k)=>v==null?"–":k==="pct"?(v*100).toFixed(1)+"%":k==="x2"?v.toFixed(2):k==="x1"?v.toFixed(1):k==="pm"?(v>0?"+":"")+v.toFixed(1):v.toFixed(1);
  const row=([l,why,v,lo,avg,hi,k])=>{if(v==null)return"";const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo))),ta=(avg-lo)/(hi-lo),good=t>=ta+.08?"up":t<=ta-.08?"down":"";
    return `<div class="adv"><div class="advt"><span title="${esc(why)}">${l}</span><b class="num ${good}">${fmt(v,k)}</b></div><div class="advb"><i class="${good}" style="width:${(t*100).toFixed(0)}%"></i><u style="left:${(ta*100).toFixed(0)}%"></u></div><small>${esc(why)}</small></div>`};
  const d=S.diet;
  return `<div class="advgrid">
    <div class="advcard"><div class="eyebrow">Offense</div>${S.off.map(row).join("")}
      ${d?`<div class="adv"><div class="advt"><span>Shot diet</span><b class="num faint" style="font-size:12px">${d.n} shots</b></div>
        <div class="diet"><i style="flex:${d.rim}" class="r">${d.rim>=.12?"Rim "+Math.round(d.rim*100)+"%":""}</i><i style="flex:${Math.max(0,1-d.rim-d.mid-d.thr)}" class="p"></i><i style="flex:${d.mid}" class="m">${d.mid>=.12?"Mid "+Math.round(d.mid*100)+"%":""}</i><i style="flex:${d.thr}" class="t">${d.thr>=.12?"3PT "+Math.round(d.thr*100)+"%":""}</i></div>
        <small>Where his shots come from: at the rim, the rest of the paint, midrange and threes</small></div>`:""}</div>
    <div class="advcard"><div class="eyebrow">Defense</div>${S.def.map(row).join("")}</div>
  </div><p class="faint" style="font-size:11.5px;margin:6px 0 0">From his last ${S.gp} games. Bars run from a low to a high NBA value; the tick is league average. Green is better than average.</p>`;
}
