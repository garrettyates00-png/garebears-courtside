/* Bets tab (Arena): one place for betting. The model's record across the league (one pick per game,
   DraftKings lines, $100 a pick), a team-by-team breakdown you can step through, today's open picks,
   your own logged bets (bets.js) and profit over time for both. */
let BH=null,BHteam="all",BHload=false;
const BH_SORT={k:"profit"};
async function bhLoad(){
  if(BH||BHload)return;BHload=true;
  let cfg;try{cfg=await (await fetch("arena/config.json?t="+Date.now(),{cache:"no-store"})).json()}catch(e){cfg={teams:[],names:{}}}
  const all=await Promise.all(cfg.teams.map(a=>fetch(`arena/picks_${a}.json?t=${Date.now()}`,{cache:"no-store"}).then(r=>r.ok?r.json():[]).catch(()=>[]).then(ps=>ps.map(p=>({...p,team:a.toUpperCase(),ta:a})))));
  const picks=all.flat();
  // one pick per game for league totals: the home team's file (both sides log the same game)
  const byGame={};for(const p of picks){const k=p.id;if(!byGame[k]||p.home)byGame[k]=p}
  BH={cfg,picks,games:Object.values(byGame)};BHload=false;renderBetsTab();
}
const bhLabel=p=>p.kind==="spread"?`${p.side==="us"?p.team:p.opp} ${p.line>0?"+":""}${p.line}`:`${p.side==="over"?"Over":"Under"} ${p.line}`;
const bhMatch=p=>p.home?`${p.opp} @ ${p.team}`:`${p.team} @ ${p.opp}`;
const bhRec=ps=>{const g=ps.filter(p=>p.result),w=g.filter(p=>p.result==="W").length,l=g.filter(p=>p.result==="L").length,pu=g.filter(p=>p.result==="P").length,pr=g.reduce((s,p)=>s+(p.profit||0),0);
  return {w,l,p:pu,n:g.length,profit:pr,roi:g.length?pr/(g.length*100):null,open:ps.filter(p=>!p.result).length}};
const bhMoney=v=>(v>=0?"+$":"−$")+Math.abs(v).toFixed(0);
const bhRecTxt=r=>`${r.w}-${r.l}${r.p?"-"+r.p:""}`;

function bhChart(model,mine){
  // cumulative profit by day for the model (one pick per game) and for your bets
  const day=iso=>ctYMD(iso);
  const series=(items,dateOf,pl)=>{const m={};for(const x of items){const d=dateOf(x);m[d]=(m[d]||0)+pl(x)}const ds=Object.keys(m).sort();let c=0;return ds.map(d=>(c+=m[d],[d,c]))};
  const A=series(model.filter(p=>p.result),p=>day(p.date),p=>p.profit||0);
  const B=series(mine.filter(b=>b.result),b=>b.date,b=>profitOf(b));
  if(A.length+B.length<2)return "";
  const ds=[...new Set([...A,...B].map(x=>x[0]))].sort(),xi=d=>ds.indexOf(d);
  const vs=[0,...A.map(x=>x[1]),...B.map(x=>x[1])],lo=Math.min(...vs),hi=Math.max(...vs),W=640,H=160,L=50,R=10,T=10,Bm=24;
  const X=i=>L+(W-L-R)*(ds.length>1?i/(ds.length-1):.5),Y=v=>T+(H-T-Bm)*(1-(v-lo)/((hi-lo)||1));
  const path=s=>s.map(([d,v],k)=>`${k?"L":"M"}${X(xi(d)).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const md=y=>`${+y.slice(4,6)}/${+y.slice(6)}`;
  return `<div class="bhchart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Profit over time">
    <line x1="${L}" x2="${W-R}" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 4"/>
    <text x="${L-6}" y="${Y(hi)+4}" text-anchor="end" class="tlax">${bhMoney(hi)}</text><text x="${L-6}" y="${Y(lo)+4}" text-anchor="end" class="tlax">${bhMoney(lo)}</text>
    <text x="${L}" y="${H-6}" class="tlax">${md(ds[0])}</text><text x="${W-R}" y="${H-6}" text-anchor="end" class="tlax">${md(ds.at(-1))}</text>
    ${A.length?`<path d="${path(A)}" fill="none" stroke="var(--a)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`:""}
    ${B.length?`<path d="${path(B)}" fill="none" stroke="var(--hi)" stroke-width="2.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`:""}
  </svg><div class="tllegend"><span><i style="background:var(--a)"></i>Model, $100 a pick</span><span><i style="background:var(--hi)"></i>You</span></div></div>`;
}

function renderBetsTab(){
  const el=$("#bSum");if(!el)return;
  if(!BH){el.innerHTML=`<div class="eyebrow">Betting</div><h2>Bets</h2><div class="simload"><span></span>Loading the model's picks for all 30 teams…</div>`;bhLoad();return}
  const M=bhRec(BH.games),mineDone=BETS.filter(b=>b.result),Y={w:mineDone.filter(b=>b.result==="W").length,l:mineDone.filter(b=>b.result==="L").length,p:mineDone.filter(b=>b.result==="P").length};
  const yPL=mineDone.reduce((s,b)=>s+profitOf(b),0),yStake=mineDone.filter(b=>b.result!=="P").reduce((s,b)=>s+b.stake,0),yOpen=BETS.filter(b=>!b.result);
  const sp=bhRec(BH.games.filter(p=>p.kind==="spread")),to=bhRec(BH.games.filter(p=>p.kind!=="spread"));
  const strong=bhRec(BH.games.filter(p=>p.edge>=3)),weak=bhRec(BH.games.filter(p=>p.edge<3));
  const today=ctYMD(new Date().toISOString()),openPicks=BH.games.filter(p=>!p.result).sort((a,b)=>a.date.localeCompare(b.date));
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Betting · DraftKings lines via ESPN</div><h2>Bets</h2></div></div>
    <div class="bhtop">
      <div class="bhcard"><div class="eyebrow">The model</div><b class="${M.profit>=0?"up":"down"}">${bhMoney(M.profit)}</b>
        <div class="bhs"><span>${bhRecTxt(M)}</span><span>ROI ${M.roi!=null?(M.roi*100).toFixed(1)+"%":"–"}</span><span>${M.n} graded</span></div>
        <p class="faint">One pick per game, $100 at −110. Spreads ${bhRecTxt(sp)} (${bhMoney(sp.profit)}) · totals ${bhRecTxt(to)} (${bhMoney(to.profit)}) · edge 3+ pts ${bhRecTxt(strong)} (${bhMoney(strong.profit)}) · smaller edges ${bhRecTxt(weak)} (${bhMoney(weak.profit)}).</p></div>
      <div class="bhcard"><div class="eyebrow">You</div><b class="${yPL>=0?"up":"down"}">${yPL>=0?"+":"−"}${money(Math.abs(yPL))}</b>
        <div class="bhs"><span>${bhRecTxt(Y)}</span><span>ROI ${yStake?((yPL/yStake)*100).toFixed(1)+"%":"–"}</span><span>${yOpen.length} open${yOpen.length?` · ${money(yOpen.reduce((s,b)=>s+b.stake,0))} at risk`:""}</span></div>
        <p class="faint">From the bets you log below. Saved on this device.</p></div>
    </div>
    ${bhChart(BH.games,BETS)}
    ${openPicks.length?`<div class="eyebrow" style="margin:18px 0 8px">Model's open picks</div><div class="bhopen">${openPicks.slice(0,12).map(p=>`<div class="bhpk"><b>${esc(bhLabel(p))}</b><small class="faint">${esc(bhMatch(p))} · ${ctYMD(p.date)===today?"today":cday(p.date)} · edge ${p.edge}</small></div>`).join("")}</div>`:""}`;
  bhTeams();
}

function bhTeams(){
  const el=$("#bTeams");if(!el||!BH)return;const N=BH.cfg.names||{};
  const rows=BH.cfg.teams.map(a=>{const ps=BH.picks.filter(p=>p.ta===a),r=bhRec(ps),U=a.toUpperCase();
    const mine=BETS.filter(b=>b.result&&(b.away===U||b.home===U));return {a,name:N[a]||U,r,mine:mine.reduce((s,b)=>s+profitOf(b),0),mn:mine.length}});
  const k=BH_SORT.k;rows.sort((x,y)=>k==="name"?x.name.localeCompare(y.name):k==="you"?y.mine-x.mine:k==="roi"?(y.r.roi??-9)-(x.r.roi??-9):y.r.profit-x.r.profit);
  const sel=BHteam,S=rows.find(r=>r.a===sel);
  const th=(key,l)=>`<th><button type="button" class="bhsort ${k===key?"on":""}" data-k="${key}">${l}</button></th>`;
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Model record by team · tap a team</div><h2>Team by team</h2></div>
      <select id="bhSel" aria-label="Team"><option value="all">All teams</option>${rows.slice().sort((x,y)=>x.name.localeCompare(y.name)).map(r=>`<option value="${r.a}" ${r.a===sel?"selected":""}>${esc(r.name)}</option>`).join("")}</select></div>
    ${S?bhTeamDetail(S):""}
    <div class="tscroll"><table class="tbl bht"><thead><tr>${th("name","Team")}<th>Record</th>${th("profit","Model $")}${th("roi","ROI")}${th("you","Your $")}</tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.a===sel?"mine":""}" data-a="${r.a}" tabindex="0"><td>${esc(r.name)}</td><td>${bhRecTxt(r.r)}${r.r.open?` <small class="faint">+${r.r.open} open</small>`:""}</td><td class="${r.r.profit>0?"up":r.r.profit<0?"down":""}">${bhMoney(r.r.profit)}</td><td>${r.r.roi!=null?(r.r.roi*100).toFixed(0)+"%":"–"}</td><td class="${r.mine>0?"up":r.mine<0?"down":"faint"}">${r.mn?(r.mine>=0?"+":"−")+money(Math.abs(r.mine)):"–"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="faint" style="font-size:12.5px;margin:10px 0 0">Each team's record is the pick logged before its own games, so a game between two teams counts for both here. League totals above use one pick per game.</p>`;
  $("#bhSel").onchange=e=>{BHteam=e.target.value;bhTeams();if(BHteam!=="all")$("#bTeams").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"})};
  el.querySelectorAll(".bhsort").forEach(b=>b.onclick=()=>{BH_SORT.k=b.dataset.k;bhTeams()});
  el.querySelectorAll("tr[data-a]").forEach(tr=>{const go=()=>{BHteam=BHteam===tr.dataset.a?"all":tr.dataset.a;bhTeams();$("#bTeams").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"})};tr.onclick=go;tr.onkeydown=e=>{if(e.key==="Enter")go()}});
  const x=$("#bhClose");if(x)x.onclick=()=>{BHteam="all";bhTeams()};
}
function bhTeamDetail(S){
  const U=S.a.toUpperCase(),ps=BH.picks.filter(p=>p.ta===S.a).sort((a,b)=>b.date.localeCompare(a.date));
  const mine=BETS.filter(b=>b.away===U||b.home===U).sort((a,b)=>b.date.localeCompare(a.date));
  const res=r=>`<span class="res ${r==="W"?"w":r==="L"?"l":""}">${r||"•"}</span>`;
  return `<div class="bhdet"><div class="row" style="margin-bottom:10px"><b style="font:600 18px var(--sans)">${esc(S.name)}</b><button class="b" type="button" id="bhClose" style="padding:5px 12px">Show all</button></div>
    <div class="bhs" style="margin-bottom:12px"><span>Model ${bhRecTxt(S.r)} · <b class="${S.r.profit>=0?"up":"down"}">${bhMoney(S.r.profit)}</b></span><span>You ${S.mn?`<b class="${S.mine>=0?"up":"down"}">${S.mine>=0?"+":"−"}${money(Math.abs(S.mine))}</b> on ${S.mn}`:"no bets yet"}</span></div>
    <div class="bhcols"><div><div class="eyebrow">Model picks</div><div class="pks">${ps.length?ps.map(p=>`<div class="pk">${res(p.result)}<div style="min-width:0"><b>${esc(bhLabel(p))}</b><div class="faint" style="font-size:12px">${cday(p.date)} · ${p.home?"vs":"@"} ${esc(p.opp)}${p.final?" · final "+p.final:""} · edge ${p.edge}</div></div><span class="num ${p.profit>0?"up":p.profit<0?"down":"faint"}">${p.profit!=null?bhMoney(p.profit):"open"}</span></div>`).join(""):`<p class="mute">No picks yet.</p>`}</div></div>
      <div><div class="eyebrow">Your bets</div><div class="pks">${mine.length?mine.map(b=>`<div class="pk">${res(b.result)}<div style="min-width:0"><b>${esc(betLabel(b))}</b><div class="faint" style="font-size:12px">${b.date.slice(4,6)}/${b.date.slice(6)} · ${money(b.stake)} at ${b.odds>0?"+":""}${b.odds}${b.final?" · "+esc(b.final):""}</div></div><span class="num ${profitOf(b)>0?"up":profitOf(b)<0?"down":"faint"}">${b.result?(profitOf(b)>=0?"+":"−")+money(Math.abs(profitOf(b))):"open"}</span></div>`).join(""):`<p class="mute" style="font-size:13.5px">None logged for this team.</p>`}</div></div></div></div>`;
}
/* keep the summary and team table in step with the bet log */
const _sb=sBets;sBets=function(){_sb();if(BH){renderBetsTab()}};
if($("#aBetsPane")&&!$("#aBetsPane").hidden){renderBetsTab();sBets();gradeBets()}
