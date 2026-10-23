/* Trade targets (Fantasy view). Buy low on rostered players running under their projection, sell high on
   yours running over it, and 1-for-1 ideas where you gain rest-of-season value while the other manager gets
   the hotter player. Early in the season the samples are tiny, so hot/cold is shrunk toward the projection. */
const CATN={pts:"points",reb:"rebounds",ast:"assists",stl:"steals",blk:"blocks",tpm:"threes",to:"turnovers"};
function tradeData(){
  if(!D||!D.players)return null;
  const me=D.me,rank=(D.teams[me]&&D.teams[me].rank)||{};
  const weak=Object.entries(rank).filter(([k,r])=>r>=7).map(([k])=>k);
  const ps=D.players.filter(p=>p.inj!=="OUT"&&p.inj!=="INJURY_RESERVE"&&p.pa>0).map(p=>{
    const g=p.cg||0,cr=g/(g+8);                // credibility of this season's sample
    const hot=p.ca!=null?(p.ca-p.pa):0;          // raw gap vs projection
    return {...p,g,cr,hot,heat:hot*cr,ros:p.pa+hot*cr*.5}; // rest-of-season: projection, nudged a little by real games
  });
  const mine=ps.filter(p=>p.t==me),theirs=ps.filter(p=>p.t!=me&&p.t);
  const buy=theirs.filter(p=>p.g>=1&&p.hot<-4&&p.pa>=28).sort((a,b)=>a.hot*Math.sqrt(a.pa)-b.hot*Math.sqrt(b.pa)).slice(0,6);
  const sell=mine.filter(p=>p.g>=1&&p.hot>5).sort((a,b)=>b.hot-a.hot).slice(0,6);
  const cold=mine.filter(p=>p.g>=1&&p.hot<-6).sort((a,b)=>a.hot-b.hot).slice(0,4);
  const hotOthers=theirs.filter(p=>p.g>=1&&p.hot>8).sort((a,b)=>b.hot-a.hot).slice(0,6);
  const ideas=[];
  // What a typical manager thinks a player is worth: projection, overreacting to the hot or cold start.
  const feel=p=>p.pa+.5*p.hot;
  const weakOf=t=>Object.entries((D.teams[t]&&D.teams[t].rank)||{}).filter(([k,r])=>r>=7).map(([k])=>k);
  for(const A of mine)for(const B of theirs){
    const gain=B.ros-A.ros,theyFeel=feel(A)-feel(B);
    // a deal they'd plausibly say yes to: they think they win or break even, and we gain a modest, real edge
    if(gain<1.5||gain>9||theyFeel<-1||B.pa<25)continue;
    const cat=weak.reduce((s,k)=>s+(k==="to"?(A[k]-B[k]):(B[k]-A[k]))/(k==="pts"?6:1),0);
    const theirNeed=weakOf(B.t).reduce((s,k)=>s+(k==="to"?(B[k]-A[k]):(A[k]-B[k]))/(k==="pts"?6:1),0);
    ideas.push({A,B,gain,theyFeel,cat,theirNeed,score:gain+Math.min(theyFeel,6)*.3+cat*.8+theirNeed*.4});
  }
  ideas.sort((x,y)=>y.score-x.score);
  const used=new Set(),top=[];
  for(const i of ideas){if(used.has("a"+i.A.id)||used.has("b"+i.B.id))continue;used.add("a"+i.A.id);used.add("b"+i.B.id);top.push(i);if(top.length===4)break}
  return {buy,sell,cold,hotOthers,ideas:top,weak};
}
const weakOf2=t=>Object.entries((D.teams[t]&&D.teams[t].rank)||{}).filter(([k,r])=>r>=7).map(([k])=>k);
function renderTrades(){
  const el=$("#secTrades");if(!el)return;const X=tradeData();if(!X){el.innerHTML="";return}
  const T=D.teams,tn=t=>esc((T[t]||{}).name||""),sg=v=>(v>0?"+":"")+v.toFixed(1);
  const row=(p,showTeam)=>`<div class="trow"><div class="nm">${esc(p.n)}<small>${esc(p.tm)} · ${p.el.join("/")}${showTeam?` · ${tn(p.t)}`:""}${p.inj?` · ${esc(injWord(p.inj))}`:""}</small></div>
    <div class="tv"><b class="${p.hot>=0?"up":"down"}">${p.ca!=null?p.ca.toFixed(1):"–"}</b><small>vs ${p.pa.toFixed(1)} proj · ${p.g} G</small></div></div>`;
  const list=(arr,showTeam,empty)=>arr.length?arr.map(p=>row(p,showTeam)).join(""):`<p class="faint" style="margin:0;font-size:13px">${empty}</p>`;
  const why=i=>{const parts=[`You gain about <b class="up">${sg(i.gain)}</b> projected points a game the rest of the way.`];
    if(i.A.hot>3&&i.B.hot<-3)parts.push(`${tn(i.B.t)} gets the hot hand (${i.A.ca.toFixed(0)} a game vs ${i.B.ca.toFixed(0)}), so it reads as a win for them.`);
    else if(i.theyFeel>=0)parts.push(`On recent form it looks even or better for ${tn(i.B.t)}.`);
    else parts.push(`Close to even on paper, so it's a fair ask.`);
    const theirs=weakOf2(i.B.t).filter(k=>k==="to"?i.B[k]-i.A[k]>.3:i.A[k]-i.B[k]>(k==="pts"?2:.3)).map(k=>CATN[k]);
    if(theirs.length)parts.push(`Pitch: it helps their ${theirs.join(", ")}.`);
    const helps=X.weak.filter(k=>k==="to"?i.A[k]-i.B[k]>.3:i.B[k]-i.A[k]>(k==="pts"?2:.3)).map(k=>CATN[k]);
    if(helps.length)parts.push(`Helps your weak spots: ${helps.join(", ")}.`);
    const lost=i.A.el.filter(x=>!i.B.el.includes(x));if(lost.length)parts.push(`<span class="faint">You'd lose ${lost.join("/")} eligibility.</span>`);
    return parts.join(" ")};
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Trade desk</div><h2>Trade targets</h2></div><span class="faint" style="font-size:13px">FP per game this season vs projection</span></div>
    <div class="tgrid">
      <div class="tcol"><div class="eyebrow up">Buy low · other teams, running cold</div>${list(X.buy,true,"Nobody notable is under projection yet.")}</div>
      <div class="tcol"><div class="eyebrow">Sell high · yours, running hot</div>${list(X.sell,false,"None of yours are far over projection yet.")}
        ${X.cold.length?`<div class="eyebrow down" style="margin-top:14px">Yours, running cold · hold</div>${list(X.cold,false,"")}`:""}</div>
      <div class="tcol"><div class="eyebrow">Over-performing elsewhere · don't pay full price</div>${list(X.hotOthers,true,"No one is far over projection yet.")}</div>
    </div>
    <div class="eyebrow" style="margin:22px 0 10px">Trade ideas · 1 for 1</div>
    ${X.ideas.length?`<div class="tideas">${X.ideas.map(i=>`<div class="tidea"><div class="tsw"><div><small class="faint">Give</small><b>${esc(i.A.n)}</b><small class="faint">${esc(i.A.tm)} · ${i.A.pa.toFixed(1)} proj</small></div><span class="arr">⇄</span><div><small class="faint">Get from ${tn(i.B.t)}</small><b>${esc(i.B.n)}</b><small class="faint">${esc(i.B.tm)} · ${i.B.pa.toFixed(1)} proj</small></div></div><p>${why(i)}</p>${typeof simTrade==="function"?`<button class="b" type="button" style="margin-top:10px;padding:6px 12px;font-size:12.5px" onclick="simTrade([${i.A.id}],[${i.B.id}],${i.B.t})">Simulate the season with this ↓</button>`:""}</div>`).join("")}</div>`:`<p class="mute" style="margin:0">No clean 1-for-1 upgrades right now.</p>`}
    <p class="faint" style="font-size:12.5px;margin:14px 0 0">Only ${Math.max(...D.players.map(p=>p.cg||0))} game${Math.max(...D.players.map(p=>p.cg||0))===1?"":"s"} played so far, so hot and cold are mostly noise. Rest-of-season value leans on the projection and moves toward real production as games pile up. Ideas assume the other manager values recent scoring.</p>`;
}
