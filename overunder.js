/* Over/under: every team's score vs its start-of-week projection, each matchup and season to date.
   Finished weeks compare the final score to the full projection; the live week compares the score so far
   to what was expected by now. */
let ouWeek="season";
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
function renderOU(){
  const el=$("#secOU");if(!el)return;const H=D.week_hist;
  if(!H||!Object.keys(H).length){el.innerHTML=`<div class="eyebrow">Over / under</div><h2>Vs projection</h2><p class="mute">Fills in after the next data refresh.</p>`;return}
  const R=ouRows(),weeks=Object.keys(H).map(Number).sort((a,b)=>a-b),cur=D.period;
  if(ouWeek!=="season"&&!H[ouWeek])ouWeek="season";
  const rows=Object.keys(D.teams).map(t=>{const x=R[t][ouWeek]||{act:0,proj:0};const d=x.act-x.proj,pc=x.proj?d/x.proj*100:0;return {t,...x,d,pc,wk:R[t].season.wk}}).filter(r=>r.proj).sort((a,b)=>b.pc-a.pc);
  const mx=Math.max(10,...rows.map(r=>Math.abs(r.pc)));
  const live=ouWeek==String(cur)||(ouWeek==="season"&&H[cur]);
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Over / under</div><h2>Vs projection</h2></div><span class="faint" style="font-size:13px">Ranked most above to most below</span></div>
    <div class="filters" style="margin-bottom:12px">${[["season","Season"],...weeks.map(w=>[String(w),`Week ${w}${w===cur?" · live":""}`])].map(([k,l])=>`<button type="button" class="fchip" data-ou="${k}" aria-selected="${k===String(ouWeek)}">${l}</button>`).join("")}</div>
    <div class="tscroll"><table class="tbl out"><thead><tr><th>Team</th><th>Actual</th><th>Proj</th><th>+/-</th><th class="ouc">vs projection</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr class="${r.t==D.me?"mine":r.t==D.opp?"opp":""}"><td><span class="nm">${i+1}. ${esc(D.teams[r.t].name)}<small>${esc(D.teams[r.t].owner)}</small></span></td><td>${Math.round(r.act)}</td><td class="faint">${Math.round(r.proj)}</td>
      <td class="${r.d>=0?"up":"down"}">${r.d>=0?"+":""}${Math.round(r.d)}</td>
      <td class="ouc"><span class="oubar"><i class="${r.pc>=0?"p":"n"}" style="width:${Math.abs(r.pc)/mx*50}%"></i></span><b class="${r.pc>=0?"up":"down"}">${r.pc>=0?"+":""}${r.pc.toFixed(1)}%</b></td></tr>`).join("")}</tbody></table></div>
    <p class="faint" style="font-size:12.5px;margin:10px 0 0">Projection is each team's lineup projection at the start of that week. ${live?"The live week compares points so far to what was expected by now. ":""}Over-performers tend to come back down; under-performers tend to bounce back.</p>`;
  el.querySelector(".filters").onclick=e=>{const b=e.target.closest("[data-ou]");if(b){ouWeek=b.dataset.ou;renderOU()}};
}
