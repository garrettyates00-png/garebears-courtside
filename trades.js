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
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Trade desk</div><h2>Trade targets</h2></div></div>
    <div id="txlab"></div>
    <div class="eyebrow" style="margin:26px 0 10px">Targets · FP per game this season vs projection</div>
    <div class="tgrid">
      <div class="tcol"><div class="eyebrow up">Buy low · other teams, running cold</div>${list(X.buy,true,"Nobody notable is under projection yet.")}</div>
      <div class="tcol"><div class="eyebrow">Sell high · yours, running hot</div>${list(X.sell,false,"None of yours are far over projection yet.")}
        ${X.cold.length?`<div class="eyebrow down" style="margin-top:14px">Yours, running cold · hold</div>${list(X.cold,false,"")}`:""}</div>
      <div class="tcol"><div class="eyebrow">Over-performing elsewhere · don't pay full price</div>${list(X.hotOthers,true,"No one is far over projection yet.")}</div>
    </div>
    <div class="eyebrow" style="margin:26px 0 4px">Trade packages</div>
    <p class="faint" style="margin:0 0 12px;font-size:13px">Deals that look fair to the other manager but play out well for you over the rest of the season.</p>
    <div id="tpk"><div class="simload"><span></span>Finding deals…</div></div>
    <p class="faint" style="font-size:12.5px;margin:14px 0 0">Only ${Math.max(...D.players.map(p=>p.cg||0))} game${Math.max(...D.players.map(p=>p.cg||0))===1?"":"s"} played so far, so hot and cold are mostly noise. Rest-of-season value leans on the projection and moves toward real production as games pile up. Ideas assume the other manager values recent scoring.</p>`;
  if(typeof renderTradeLab==="function")renderTradeLab();
  // the search takes a moment, so it only runs once the section is about to scroll into view
  const go=()=>{try{renderPackages()}catch(e){console.error(e);const x=$("#tpk");if(x)x.innerHTML=""}};
  const tp=$("#tpk");if(TPK.key&&TPK.list)go();else if("IntersectionObserver" in window&&tp){const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();setTimeout(go,30)}},{rootMargin:"600px"});io.observe(tp)}else setTimeout(go,60);
}

/* ---------- Trade packages ----------
   Deals that look fair (or a little better for them) to the other manager but are worth real points to you when
   played through the season model the Trade lab uses (games left per week, your lineup capacity, injury time).
   Where the hidden edge comes from:
   - consolidation: two of your depth pieces for one starter. They see more total points; you see that only 11 of
     yours play a day, so the star's points all count and the depth pieces' mostly didn't
   - injuries: managers price a hurt player near his healthy value; the model counts the weeks he misses
   - schedule: more NBA games left for the player you get
   - form: buy guys running cold (cheap), sell guys running hot (look better than they project)
   Perceived value is star-weighted (a 45 is worth much more than two 25s to a typical manager). */
let TPK={key:null,list:null};
function tpkPerc(p){const g=p.cg||0,cr=g/(g+8),hot=p.ca!=null?(p.ca-p.pa)*cr:0,out=txIsOut(p)?Math.max(.55,1-.05*txWeeksOut(p)):1;
  return Math.pow(Math.max(0,(p.pa+.6*hot)*out),2.2)}
// a roster spot a trade opens gets filled from free agency, so it's worth a replacement-level player, not nothing
let TPKR=null;
function tpkRepl(){if(TPKR)return TPKR;const fa=(D.fa||[]).filter(f=>!txIsOut(f)).map(f=>f.pa).sort((a,b)=>b-a);
  // free agents only carry a preseason-style projection, and they're free agents for a reason: count them at 85%
  const k=.85;
  const gp=Object.values(D.sim.gpw||{});return TPKR={v:k*(fa.length?fa.slice(0,3).reduce((a,b)=>a+b,0)/Math.min(3,fa.length):26),
    g:w=>gp.length?gp.reduce((a,x)=>a+((x||{})[w]||0),0)/gp.length:3.4}}
function tpkVal(t,outIds,inIds){const A=txRoster(t,outIds,inIds),S=D.sim,last=txLast();let v=0;
  for(let w=S.cur+1;w<=S.reg;w++)v+=txFut(A.ps,w);for(let w=S.reg+1;w<=last;w++)v+=.5*txFut(A.ps,w);return {v,drops:A.drops}}
function tpkGames(p){const S=D.sim;let g=0;for(let w=S.cur+1+txMiss(p);w<=S.reg;w++)g+=((S.gpw[p.tm]||{})[w])||0;return g}
function tradePackages(){
  if(!D||!D.sim||!D.sim.gpw||typeof txRoster!=="function")return [];
  const key=D.pulled+"|"+JSON.stringify(txOW());if(TPK.key===key)return TPK.list;TPKR=null;
  const me=D.me,S=D.sim,weeks=Math.max(1,S.reg-S.cur),mine=D.players.filter(p=>p.t==me);
  const base={};const bv=t=>base[t]??(base[t]=tpkVal(t,new Set(),new Set()).v);
  const targets=D.players.filter(p=>p.t&&p.t!=me&&!txIsOut(p)&&txFull(p)>=27).sort((a,b)=>txFull(b)-txFull(a)).slice(0,32);
  const minStar=Math.min(...mine.filter(p=>!isBench(p.slot)).map(txFull));
  const out=[];
  const consider=(give,get)=>{
    const t=get[0].t,pin=get.reduce((s,p)=>s+tpkPerc(p),0),pout=give.reduce((s,p)=>s+tpkPerc(p),0);
    const theySee=(pout-pin)/Math.max(pin,1);                 // their perceived gain, as a share of what they give
    if(theySee<-.04||theySee>.35)return;                       // looks even or better to them, but don't overpay
    const gs=new Set(give.map(p=>p.id)),ts=new Set(get.map(p=>p.id));
    const M=tpkVal(me,gs,ts),Th=tpkVal(t,ts,gs);
    const my=(M.v-bv(me))/weeks,th=(Th.v-bv(t))/weeks;
    if(my<4)return;
    out.push({give,get,t,my,th,theySee,drops:M.drops,tdrops:Th.drops,score:my+Math.min(th,0)*.15})};
  for(const B of targets){
    for(const A of mine){if(txFull(A)>txFull(B)+6)continue;consider([A],[B])}
    // 2-for-1: two of yours that look like more to them, for one better player
    const cand=mine.filter(a=>txFull(a)<txFull(B)-2&&txFull(a)>txFull(B)*.45);
    for(let i=0;i<cand.length;i++)for(let j=i+1;j<cand.length;j++){const a=cand[i],b=cand[j];
      if(txFull(a)<18&&txFull(b)<18)continue;consider([a,b],[B])}
  }
  out.sort((x,y)=>y.score-x.score);
  const usedGet=new Set(),usedT={},pick=[];
  const n2=out.filter(o=>o.give.length>1).length,n1=out.length-n2;   // mix: up to 4 of either kind when both exist
  const cnt={1:0,2:0};
  for(const o of out){const k=o.get[0].id,kind=o.give.length>1?2:1;if(usedGet.has(k)||(usedT[o.t]||0)>=2)continue;
    if(cnt[kind]>=((kind===2?n1:n2)?4:6))continue;cnt[kind]++;
    if(pick.some(p=>p.give.length===o.give.length&&p.give.every(g=>o.give.some(x=>x.id===g.id))))continue;
    usedGet.add(k);usedT[o.t]=(usedT[o.t]||0)+1;pick.push(o);if(pick.length===6)break}
  TPK={key,list:pick};return pick;
}
function tpkWhy(o){
  const T=D.teams,tn=esc((T[o.t]||{}).name||""),B=o.get[0],why=[];
  if(o.give.length>1)why.push(`<b>Consolidation.</b> They get two rotation players and more total points on paper. You fill the open roster spot with a free agent (about ${Math.round(tpkRepl().v)} a game), so it's really ${esc(last(B.n))} plus a pickup for ${o.give.map(p=>esc(last(p.n))).join(" and ")}.`);
  else{const dA=txFull(B)-txFull(o.give[0]);if(dA>=1)why.push(`<b>Straight upgrade.</b> ${esc(last(B.n))} is worth about ${dA.toFixed(1)} more a game right now.`)}
  for(const A of o.give)if(txIsOut(A))why.push(`<b>${esc(A.n)} is out</b> about ${txWeeksOut(A)} more week${txWeeksOut(A)===1?"":"s"}. Managers price him near his healthy value; the model counts the games he misses.`);
  const gB=tpkGames(B),gA=o.give.reduce((s,p)=>s+tpkGames(p),0)/o.give.length;
  if(o.give.length===1&&gB-gA>=2)why.push(`<b>Schedule.</b> ${esc(last(B.n))} has about ${Math.round(gB)} games left vs ${Math.round(gA)} for ${esc(last(o.give[0].n))}.`);
  const hotB=B.ca!=null?B.ca-B.pa:0;if((B.cg||0)>=3&&hotB<-3)why.push(`<b>Buying low.</b> ${esc(last(B.n))} is ${Math.abs(hotB).toFixed(1)} under his projection this season, so his price is down.`);
  for(const A of o.give){const h=A.ca!=null?A.ca-A.pa:0;if((A.cg||0)>=3&&h>3)why.push(`<b>Selling high.</b> ${esc(last(A.n))} is running ${h.toFixed(1)} over his projection.`)}
  why.push(`<b>The pitch to ${tn}:</b> ${o.theySee>=.05?"it reads as a win for them on paper":"it reads as an even swap"}${o.th>=0?", and it's genuinely fine for them too":""}.`);
  if(o.drops.length)why.push(`<span class="faint">You'd need to drop ${o.drops.map(p=>esc(p.n)).join(", ")}.</span>`);
  return why;
}
function tpkLoad(i){const o=TPK.list[i];if(!o||typeof txAnalyze!=="function")return;
  TX.team=o.t;TX.give=new Set(o.give.map(p=>p.id));TX.get=new Set(o.get.map(p=>p.id));TX.res=null;renderTradeLab();
  $("#txlab").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});txAnalyze()}
function renderPackages(){
  const el=$("#tpk");if(!el)return;
  const L=tradePackages(),T=D.teams;
  if(!L.length){el.innerHTML=`<p class="mute" style="margin:0">No deals right now that help you a lot and still look fair to the other side.</p>`;return}
  const pl=p=>`<div class="tpkp"><b>${esc(p.n)}</b><small>${esc(p.tm)} · ${txFull(p).toFixed(1)}${p.inj?` · ${esc(injWord(p.inj))}`:""}</small></div>`;
  el.innerHTML=`<div class="tpkgrid">${L.map((o,i)=>`<article class="tpk">
      <div class="tpkhead"><span class="eyebrow">With ${esc(T[o.t].name)}</span><span class="tpkgain"><b>+${Math.round(o.my)}</b><small>pts / week for you</small></span></div>
      <div class="tpksw"><div><small class="faint">You give</small>${o.give.map(pl).join("")}</div><span class="arr">⇄</span><div><small class="faint">You get</small>${o.get.map(pl).join("")}</div></div>
      <div class="tpkmeta"><span>They see <b class="${o.theySee>=0?"up":""}">${o.theySee>=0?"+":"−"}${Math.abs(Math.round(o.theySee*100))}%</b> on paper</span><span>Real for them <b class="${o.th>=0?"up":"down"}">${o.th>=0?"+":"−"}${Math.abs(Math.round(o.th))}</b>/wk</span></div>
      <ul>${tpkWhy(o).map(w=>`<li>${w}</li>`).join("")}</ul>
      <button class="b primary" type="button" data-tpk="${i}">Simulate in the Trade lab ↑</button></article>`).join("")}</div>`;
  el.querySelectorAll("[data-tpk]").forEach(b=>b.onclick=()=>tpkLoad(+b.dataset.tpk));
}
