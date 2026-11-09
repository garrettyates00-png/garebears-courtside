/* Results: once a matchup week is over (Sunday night, after the last game) and through Monday, the Matchups
   section becomes the week's results. One card per team with gold trim for a win and red for a loss: final score,
   opponent, new record, power rank and how they did against their start-of-week projection. On Monday you can
   switch back to the live week, which hides the results until the next one. */
function resWeek(){
  // Monday: the new week's first day, show last week's results
  const B=D.base&&D.base.teams[D.me],days=B?Object.keys(B.days).sort():[],today=TODAY();
  if(days.length&&today===days[0]&&D.period>1&&(D.week_hist||{})[D.period-1])return {w:D.period-1,live:false};
  // Sunday night: last day of the week and every game in the league is done
  if((D.days||[]).some(d=>d>today))return null;
  if(typeof isLiveWeek!=="function"||!isLiveWeek())return null;
  for(const t of Object.keys(D.teams)){
    if(Math.abs(finalMean(+t)-liveScore(+t))>=1)return null;
    if(P(+t).some(p=>{if(isBench(p.slot))return false;const g=gameOf(p);return g&&g.state!=="post"}))return null}
  return {w:D.period,live:true};
}
function renderResults(){
  const sec=$("#secMatchups");if(!sec||!D)return;
  let box=$("#results");if(!box){box=document.createElement("div");box.id="results";sec.insertBefore(box,$("#cards"))}
  const R=resWeek();let hid=false;try{hid=R&&localStorage.getItem("grindex-res-hide-"+R.w)==="1"}catch(e){}
  sec.classList.toggle("showres",!!R&&!hid);
  if(!R||hid){box.innerHTML=hid&&R&&!R.live?`<button class="b resback" type="button" id="resShow">Show week ${R.w} results</button>`:"";
    const b=$("#resShow");if(b)b.onclick=()=>{try{localStorage.removeItem("grindex-res-hide-"+R.w)}catch(e){}renderResults()};return}
  const W=R.w,H=D.week_hist||{},T=D.teams;
  const score=t=>R.live?liveScore(+t):((H[W]||{}).act||{})[t]||0;
  const proj=t=>((H[W]||{}).proj||{})[t];
  const games=((D.sim&&D.sim.sched)||D.sched||[]).filter(m=>m[0]===W&&m[2]!=null);   // the full-season schedule (D.sched only has this week and next)
  // record after this week: ESPN's record already has it on Monday; Sunday night add tonight's result
  const rec={};for(const t of Object.keys(T))rec[t]=[T[t].w||0,T[t].l||0,T[t].ti||0];
  if(R.live)for(const [,h,a] of games){if((T[h].w||0)+(T[h].l||0)+(T[h].ti||0)>=W)continue;  // ESPN already counted it
    const x=Math.round(score(h)),y=Math.round(score(a));
    if(x>y){rec[h][0]++;rec[a][1]++}else if(y>x){rec[a][0]++;rec[h][1]++}else{rec[h][2]++;rec[a][2]++}}
  const pr=Object.keys(T).sort((a,b)=>T[b].power-T[a].power);
  const cards=[];
  for(const [,h,a] of games)for(const [t,o] of [[h,a],[a,h]]){
    const s=score(t),so=score(o),won=Math.round(s)>Math.round(so),tie=Math.round(s)===Math.round(so),pj=proj(t);
    cards.push({t:String(t),o:String(o),s,so,won,tie,pj,m:Math.abs(s-so)})}
  cards.sort((x,y)=>(y.won-x.won)||(y.s-x.s));
  const me=String(D.me);
  box.innerHTML=`<div class="reshead"><div><div class="eyebrow">Final · week ${W}</div><h3>Results</h3></div>
      ${R.live?"":`<button class="b" type="button" id="resHide">Go to this week →</button>`}</div>
    <div class="resgrid">${cards.map(c=>{const r=rec[c.t],dv=c.pj!=null?c.s-c.pj:null;
      return `<article class="rescard ${c.tie?"tie":c.won?"won":"lost"} ${c.t===me?"me":""}">${c.won&&!c.tie?'<div class="rgold" aria-hidden="true"></div>':""}
        <div class="rtop"><div class="rteam"><b>${esc(T[c.t].name)}</b><small>${esc(T[c.t].owner||"")}${c.t===me?" · you":""}</small></div><span class="rcoin">${c.tie?"T":c.won?"W":"L"}</span></div>
        <div class="rscore"><b>${Math.round(c.s)}</b><span>vs ${Math.round(c.so)} ${esc(T[c.o].name)}</span></div>
        <div class="rstats"><span><small>Record</small>${r[0]}-${r[1]}${r[2]?"-"+r[2]:""}</span><span><small>Power</small>#${pr.indexOf(c.t)+1}</span>
          <span><small>Margin</small>${c.tie?"0":(c.won?"+":"−")+Math.round(c.m)}</span>${dv!=null?`<span><small>vs proj</small><em class="${dv>=0?"up":"down"}">${dv>=0?"+":"−"}${Math.abs(Math.round(dv))}</em></span>`:""}</div></article>`}).join("")}</div>`;
  const hb=$("#resHide");if(hb)hb.onclick=()=>{try{localStorage.setItem("grindex-res-hide-"+W,"1")}catch(e){}renderResults();$("#secMatchups").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"})};
}
