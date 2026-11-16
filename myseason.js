/* My schedule: every week of the regular season against your opponent that week.
   Played weeks show the final score. This week shows the live projection and win chance. Future weeks are projected
   from both rosters as they stand now: each player's per-game value times his team's games that week, the best ones
   filling the lineup spots you have, and injured players only counted from the week they're expected back (the same
   model as the Trade lab, where you can set exact return weeks). Win chance treats each team's week as uncertain by
   about 10% of its total. */
function msPts(t,w){if(typeof txRoster!=="function")return null;const R=txRoster(t,new Set(),new Set());return txFut(R.ps,w)}
function msWin(a,b){const sd=Math.sqrt((a*.1)**2+(b*.1)**2)||1,z=(a-b)/sd;return 1/(1+Math.exp(-1.702*z))}   // normal approximation
function renderMySched(){
  const el=$("#secMySched");if(!el||!D||!D.sim||!D.sim.sched)return;
  const S=D.sim,me=D.me,T=D.teams,H=D.week_hist||{},cur=D.period,reg=S.reg;
  const games=S.sched.filter(m=>m[1]==me||m[2]==me).sort((x,y)=>x[0]-y[0]);
  // when my injured players come back (weeks counted from this one)
  const hurt=D.players.filter(p=>p.t==me&&typeof txIsOut==="function"&&txIsOut(p)).map(p=>({p,back:cur+txWeeksOut(p)}));
  let ew=0,el2=0,rw=+T[me].w||0,rl=+T[me].l||0;
  const rows=games.map(([w,h,a])=>{
    const o=String(h==me?a:h),on=T[o]||{name:"?"};
    let my,op,res="",wp=null,kind;
    if(w<cur&&H[w]&&H[w].act){my=H[w].act[me];op=H[w].act[o];kind="past";res=my>op?"W":my<op?"L":"T"}
    else if(w===cur){kind="now";try{my=finalMean(me);op=finalMean(+o);wp=winProb(me,+o)}catch(e){my=msPts(me,w);op=msPts(+o,w);wp=msWin(my,op)}}
    else{kind="next";my=msPts(me,w);op=msPts(+o,w);wp=msWin(my,op)}
    if(kind!=="past"){ew+=wp;el2+=1-wp}
    const back=hurt.filter(x=>x.back===w).map(x=>x.p),oppOut=w>=cur?D.players.filter(p=>p.t==o&&typeof txIsOut==="function"&&txIsOut(p)&&w<cur+txWeeksOut(p)&&txFull(p)>=30):[];
    const myOut=w>=cur?hurt.filter(x=>w<x.back).map(x=>x.p):[];
    return {w,o,on,my,op,res,wp,kind,back,oppOut,myOut}});
  const projW=rw+ew,projL=rl+el2;
  const fmt=v=>v==null?"–":Math.round(v).toLocaleString();
  const pill=r=>{if(r.kind==="past")return `<span class="msres ${r.res}">${r.res}</span>`;const p=Math.round(r.wp*100),c=p>=60?"good":p<=40?"bad":"mid";return `<span class="mswp ${c}">${p}%</span>`};
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Regular season · as it stands now</div><h2>My schedule</h2></div>
      <div class="msrec"><small>Projected record</small><b>${Math.round(projW)}–${Math.round(projL)}</b><span class="faint">now ${rw}–${rl}</span></div></div>
    ${hurt.length?`<div class="msinj">${hurt.map(x=>`<span><b>${esc(x.p.n)}</b> ${esc(injWord(x.p.inj))} · back about week ${x.back}${(txOW()||{})[x.p.id]!=null?"":" <em>(estimate)</em>"}</span>`).join("")}</div>`:""}
    <div class="mslist">${rows.map(r=>{const lead=r.my-r.op;
      return `<div class="msrow ${r.kind} ${r.kind==="past"?"r"+r.res:""}">
        <div class="msw"><small>Week</small><b>${r.w}</b></div>
        <div class="mso"><b>${esc(r.on.name)}</b><small>${esc(r.on.owner||"")}${r.on.w!=null?` · ${r.on.w}-${r.on.l}`:""}${r.kind==="now"?' · <span class="up">this week</span>':""}</small>
          ${r.back.length||r.myOut.length||r.oppOut.length?`<div class="mschips">${r.back.map(p=>`<span class="msc back">${esc(last(p.n))} back</span>`).join("")}${r.myOut.length&&!r.back.length?`<span class="msc out">no ${r.myOut.map(p=>esc(last(p.n))).join(", ")}</span>`:""}${r.oppOut.slice(0,2).map(p=>`<span class="msc opp">their ${esc(last(p.n))} out</span>`).join("")}</div>`:""}</div>
        <div class="mss"><b class="${lead>=0?"":"faint"}">${fmt(r.my)}</b><span>–</span><b class="${lead<0?"":"faint"}">${fmt(r.op)}</b><small>${r.kind==="past"?"final":r.kind==="now"?"projected final":"projected"}</small></div>
        <div class="msp">${pill(r)}</div></div>`}).join("")}</div>
    <p class="faint" style="font-size:12px;margin:10px 0 0">Future weeks use both rosters as they are today, games per week, your lineup spots, and injury returns (set exact return weeks in the Trade lab). Playoffs start after week ${reg}.</p>`;
}
