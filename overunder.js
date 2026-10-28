/* Over/under: every team's score vs its start-of-week projection, each matchup and season to date.
   Finished weeks compare the final score to the full projection; the live week compares the score so far
   to what was expected by now. */
let ouWeek="season",ouTab="proj";
function ouRows(){
  const H=D.week_hist||{},cur=String(D.period),teams=Object.keys(D.teams),out={};
  for(const t of teams)out[t]={season:{act:0,proj:0,wk:0}};
  for(const [k,w] of Object.entries(H)){
    for(const t of teams){
      let act=w.act[t],proj=w.proj[t];if(act==null||proj==null)continue;
      if(k===cur&&typeof expectedSoFar==="function"){const e=expectedSoFar(+t);if(e!=null){act=liveScore(+t);proj=e}}
      out[t][k]={act,proj};const S=out[t].season;S.act+=act;S.proj+=proj;S.wk++;
    }
  }
  return out;
}
const OUTABS=[["proj","Vs projection"],["bench","Bench points"],["picks","Move scorecard"],["moves","Activity"]];
let mvTeam="all";
function ouTabs(){return `<div class="filters outabs" style="margin-bottom:14px">${OUTABS.map(([k,l])=>`<button type="button" class="fchip" data-tab="${k}" aria-selected="${k===ouTab}">${l}</button>`).join("")}</div>`}
function ouWire(el){el.querySelector(".outabs").onclick=e=>{const b=e.target.closest("[data-tab]");if(b){ouTab=b.dataset.tab;renderOU()}}}
function renderOU(){
  const el=$("#secOU");if(!el)return;
  if(ouTab!=="proj"){renderMgr(el);return}
  const H=D.week_hist;
  if(!H||!Object.keys(H).length){el.innerHTML=`<div class="eyebrow">League report</div><h2>Over / under</h2>${ouTabs()}<p class="mute">Fills in after the next data refresh.</p>`;ouWire(el);return}
  const R=ouRows(),weeks=Object.keys(H).map(Number).sort((a,b)=>a-b),cur=D.period;
  if(ouWeek!=="season"&&!H[ouWeek])ouWeek="season";
  const rows=Object.keys(D.teams).map(t=>{const x=R[t][ouWeek]||{act:0,proj:0};const d=x.act-x.proj,pc=x.proj?d/x.proj*100:0;return {t,...x,d,pc,wk:R[t].season.wk}}).filter(r=>r.proj).sort((a,b)=>b.pc-a.pc);
  const mx=Math.max(10,...rows.map(r=>Math.abs(r.pc)));
  const live=ouWeek==String(cur)||(ouWeek==="season"&&H[cur]);
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">League report</div><h2>Over / under</h2></div><span class="faint" style="font-size:13px">Ranked most above to most below</span></div>${ouTabs()}
    <div class="filters" style="margin-bottom:12px">${[["season","Season"],...weeks.map(w=>[String(w),`Week ${w}${w===cur?" · live":""}`])].map(([k,l])=>`<button type="button" class="fchip" data-ou="${k}" aria-selected="${k===String(ouWeek)}">${l}</button>`).join("")}</div>
    <div class="tscroll"><table class="tbl out"><thead><tr><th>Team</th><th>Actual</th><th>Proj</th><th>+/-</th><th class="ouc">vs projection</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr class="${r.t==D.me?"mine":r.t==D.opp?"opp":""}"><td><span class="nm">${i+1}. ${esc(D.teams[r.t].name)}<small>${esc(D.teams[r.t].owner)}</small></span></td><td>${Math.round(r.act)}</td><td class="faint">${Math.round(r.proj)}</td>
      <td class="${r.d>=0?"up":"down"}">${r.d>=0?"+":""}${Math.round(r.d)}</td>
      <td class="ouc"><span class="oubar"><i class="${r.pc>=0?"p":"n"}" style="width:${Math.abs(r.pc)/mx*50}%"></i></span><b class="${r.pc>=0?"up":"down"}">${r.pc>=0?"+":""}${r.pc.toFixed(1)}%</b></td></tr>`).join("")}</tbody></table></div>
    <p class="faint" style="font-size:12.5px;margin:10px 0 0">Projection is each team's lineup projection at the start of that week. ${live?"The live week compares points so far to what was expected by now. ":""}Over-performers tend to come back down; under-performers tend to bounce back.</p>`;
  el.querySelector(".filters:not(.outabs)").onclick=e=>{const b=e.target.closest("[data-ou]");if(b){ouWeek=b.dataset.ou;renderOU()}};ouWire(el);
}

/* manager report: bench points left behind, best pickups, activity */
function renderMgr(el){
  const M=D.mgr,T=D.teams,nm=t=>esc((T[t]||{}).name||"");
  const head=`<div class="sec-h"><div><div class="eyebrow">League report${M&&M.since?` · since ${new Date(M.since+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}`:""}</div><h2>${{bench:"Bench points",picks:"Move scorecard",moves:"Activity"}[ouTab]}</h2></div></div>${ouTabs()}`;
  if(!M){el.innerHTML=head+`<p class="mute">Fills in after the next data refresh.</p>`;ouWire(el);return}
  const cls=t=>t==D.me?"mine":t==D.opp?"opp":"";let body="",note="";
  if(ouTab==="bench"){
    const rows=Object.entries(M.teams).map(([t,o])=>({t,...o,eff:o.opt?o.act/o.opt*100:100})).sort((a,b)=>b.lost-a.lost),mx=Math.max(1,...rows.map(r=>r.lost));
    body=`<div class="tscroll"><table class="tbl out"><thead><tr><th>Team</th><th>Left on bench</th><th>This week</th><th>Dead starts</th><th class="ouc">Lineup efficiency</th></tr></thead><tbody>
      ${rows.map((r,i)=>`<tr class="${cls(r.t)}"><td><span class="nm">${i+1}. ${nm(r.t)}<small>${esc((T[r.t]||{}).owner||"")}</small></span></td><td class="down">${Math.round(r.lost)}</td><td>${Math.round(r.lost_wk)}</td><td>${r.dead}</td>
        <td class="ouc"><span class="oubar"><i class="n" style="right:auto;left:0;width:${r.lost/mx*100}%"></i></span><b>${r.eff.toFixed(1)}%</b></td></tr>`).join("")}</tbody></table></div>`;
    note="Left on bench: points your best possible lineup would have scored each day, in hindsight, minus what your starters scored. Dead starts: a starter who scored nothing on a day a benched player did score. Lineup efficiency: points scored out of the best possible.";
  }else if(ouTab==="picks"){
    const MV=(M.moves||[]).filter(m=>mvTeam==="all"||String(m.t)===mvTeam);
    const sg=v=>v==null?"–":(v>0?"+":v<0?"−":"")+Math.abs(Math.round(v));
    body=`<div class="sfil" style="margin-bottom:10px"><select id="mvTeam" aria-label="Team"><option value="all">All teams</option>${Object.keys(T).map(t=>`<option value="${t}" ${t===mvTeam?"selected":""}>${esc(T[t].name)}${t==D.me?" (you)":""}</option>`).join("")}</select></div>
      ${MV.length?`<div class="tscroll"><table class="tbl out mvt"><thead><tr><th>Move</th><th>Added</th><th>Dropped</th><th>Net</th></tr></thead><tbody>
      ${MV.map(m=>`<tr class="${cls(String(m.t))}"><td><span class="nm">${m.add.map(a=>`+ ${esc(a.n)}`).concat(m.drop.map(d=>`− ${esc(d.n)}`)).join("<br>")}<small>${nm(m.t)} · ${new Date(m.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small></span></td>
        <td class="up">${m.add.length?m.add.map(a=>`${Math.round(a.pts)} <small class="faint">(${Math.round(a.lineup)} started)</small>`).join("<br>"):"–"}</td>
        <td class="down">${m.drop.length?m.drop.map(d=>d.pts==null?"?":Math.round(d.pts)).join("<br>"):"–"}</td>
        <td><b class="${m.net==null?"":m.net>=0?"up":"down"}">${sg(m.net)}</b></td></tr>`).join("")}</tbody></table></div>`:`<p class="mute">No moves yet.</p>`}`;
    note="Added: everything the new player has scored since the move while on that team (starts in parentheses). Dropped: what the cut player has scored since, wherever he's been, including as a free agent. Net = added minus dropped. A negative net means the player you cut has outscored the one you added.";
  }else{
    const rows=Object.entries(M.teams).map(([t,o])=>({t,...o})).sort((a,b)=>(b.adds+b.trades)-(a.adds+a.trades));
    const pk={};for(const p of M.picks){pk[p.t]=(pk[p.t]||0)+p.pts}
    body=`<div class="tscroll"><table class="tbl out"><thead><tr><th>Team</th><th>Adds</th><th>Drops</th><th>Trades</th><th>Pickup points</th><th>Net from moves</th></tr></thead><tbody>
      ${rows.map((r,i)=>`<tr class="${cls(r.t)}"><td><span class="nm">${i+1}. ${nm(r.t)}<small>${esc((T[r.t]||{}).owner||"")}</small></span></td><td>${r.adds}</td><td>${r.drops}</td><td>${r.trades}</td><td class="up">${Math.round(pk[r.t]||0)}</td><td class="${(r.net||0)>=0?"up":"down"}"><b>${(r.net||0)>=0?"+":"−"}${Math.abs(Math.round(r.net||0))}</b></td></tr>`).join("")}</tbody></table></div>`;
    note="Pickup points: what every player a team picked up has scored in its starting lineup since. Net from moves: points added players scored minus points dropped players scored, since each move.";
  }
  el.innerHTML=head+body+`<p class="faint" style="font-size:12.5px;margin:10px 0 0">${note}</p>`;ouWire(el);
  const mt=$("#mvTeam");if(mt)mt.onchange=e=>{mvTeam=e.target.value;renderOU()};
}
