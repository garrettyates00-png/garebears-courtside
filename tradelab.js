/* Trade lab: test any trade (or an offer someone sent you) for both the short and the long run.
   Right now: rest of this week, played day by day through real lineup slots from the day the trade
   clears, plus what it does to this week's win odds. Next week and the rest of the season: weekly
   points with real NBA games per week and your lineup capacity, injured players back when you say.
   Odds: the season simulator re-run with and without the trade (same random draws).
   Roster limits are enforced: if a side ends up over the limit, its weakest player gets dropped. */
let TX={team:null,give:new Set(),get:new Set(),eff:2,res:null,busy:false};
const TX_ACTIVE=15,TX_IR=2;
function txOW(){try{return JSON.parse(localStorage.getItem("grindex-ow")||"{}")}catch(e){return {}}}
function txSaveOW(o){try{localStorage.setItem("grindex-ow",JSON.stringify(o))}catch(e){}}
const tlFullS=p=>txFull(p).toFixed(0);
const txFull=p=>p.av>0?(p.v??p.pa)/p.av:p.pa;
const txIsOut=p=>p.inj==="OUT"||p.inj==="INJURY_RESERVE"||p.inj==="SUSPENSION";
// weeks until back (what the user set, else a default) -> future weeks missed
function txWeeksOut(p){const o=txOW();if(o[p.id]!=null)return +o[p.id];return txIsOut(p)?(p.inj==="SUSPENSION"?1:4):0}
const txMiss=p=>Math.max(0,txWeeksOut(p)-1);

/* roster after the trade, with forced drops if a side is over the limit */
function txRoster(t,outIds,inIds){
  let ps=D.players.filter(p=>p.t==t&&!outIds.has(p.id)).concat(D.players.filter(p=>inIds.has(p.id)));
  const ir=ps.filter(txIsOut).sort((a,b)=>txWeeksOut(b)-txWeeksOut(a)).slice(0,TX_IR),irS=new Set(ir.map(p=>p.id));
  const act=ps.filter(p=>!irS.has(p.id)),drops=[];
  if(act.length>TX_ACTIVE){
    const keep=act.slice().sort((a,b)=>txRos(b)-txRos(a));
    for(const p of keep.slice(TX_ACTIVE))drops.push(p);
  }
  const dS=new Set(drops.map(p=>p.id));
  return {ps:ps.filter(p=>!dS.has(p.id)),drops};
}
// rough rest-of-season worth of one player, for picking who gets dropped
function txRos(p){const S=D.sim;let g=0;for(let w=S.cur+1+txMiss(p);w<=S.reg;w++)g+=((S.gpw[p.tm]||{})[w])||0;return txFull(p)*g}

/* this week: day by day, best lineup through the real slots */
const TX_ELIG={PG:["PG"],SG:["SG"],SF:["SF"],PF:["PF"],C:["C"],G:["PG","SG"],F:["SF","PF"],UTIL:["PG","SG","SF","PF","C"]};
function txDay(ps,iso){
  const open=D.slots.slice();let pts=0;
  const play=ps.filter(p=>(p.days||[]).includes(iso)&&!txIsOut(p)).sort((a,b)=>b.v-a.v);
  for(const p of play){
    // most specific open slot first: exact position, then G/F, then UTIL
    let k=-1,best=9;
    open.forEach((s,i)=>{if(!s)return;const e=TX_ELIG[s];if(!e||!e.some(x=>p.el.includes(x)))return;const r=s==="UTIL"?3:s.length===1?2:1;if(r<best){best=r;k=i}});
    if(k<0)continue;open[k]=null;pts+=p.v;
  }
  return pts;
}
function txWeek(ps,fromIso){return D.days.filter(d=>d>=fromIso&&d>=TODAY()).reduce((a,d)=>a+txDay(ps,d),0)}
/* future week w: lineup capacity model (same as the simulator, without the randomness) */
function txFut(ps,w){const S=D.sim,k=w-S.cur-1;let left=Math.round(D.slots.length*(S.days[w]||7)*.82),pts=0,used=0;
  for(const p of ps.filter(p=>k>=txMiss(p)).sort((a,b)=>txFull(b)-txFull(a))){if(++used>TX_ACTIVE)break;const g=((S.gpw[p.tm]||{})[w])||0;const n=Math.min(g,Math.max(0,left));pts+=txFull(p)*n;left-=n}
  return pts}
function txLast(){const S=D.sim;return Math.max(...Object.keys(S.days).map(Number).filter(w=>w<=S.reg+(S.rounds||2)*(S.plen||1)))}
function txSide(t,outIds,inIds,effIso){
  const before=D.players.filter(p=>p.t==t),A=txRoster(t,outIds,inIds),S=D.sim,last=txLast();
  const wkB=txWeek(before,effIso),wkA=txWeek(A.ps,effIso);
  let nB=txFut(before,S.cur+1),nA=txFut(A.ps,S.cur+1),rB=0,rA=0,pB=0,pA=0;
  for(let w=S.cur+1;w<=S.reg;w++){rB+=txFut(before,w);rA+=txFut(A.ps,w)}
  for(let w=S.reg+1;w<=last;w++){pB+=txFut(before,w);pA+=txFut(A.ps,w)}
  return {wk:[wkB,wkA],next:[nB,nA],ros:[rB,rA],po:[pB,pA],drops:A.drops,rem:S.reg-S.cur}
}
/* this week's matchup odds with a shifted mean */
function txWin(dMe,dOpp){if(typeof winProb!=="function"||!D.opp)return null;
  const p0=winProb(D.me,D.opp),s=Math.sqrt(sd(D.me)**2+sd(D.opp)**2),m=finalMean(D.me)-finalMean(D.opp);
  return [p0,restNow(D.me)+restNow(D.opp)>0?tcdf((m+dMe-dOpp)/s):p0]}

async function txAnalyze(){
  if(TX.busy)return;TX.busy=true;renderTradeLab();
  const me=D.me,t=TX.team,give=new Set(TX.give),get=new Set(TX.get);
  const effIso=(()=>{const d=new Date(TODAY()+"T12:00:00");d.setDate(d.getDate()+TX.eff);return d.toISOString().slice(0,10)})();
  const mine=txSide(me,give,get,effIso),theirs=txSide(t,get,give,effIso);
  const dMe=mine.wk[1]-mine.wk[0],dTh=theirs.wk[1]-theirs.wk[0];
  const win=txWin(dMe,t==D.opp?dTh:0);
  // season odds: both runs use the same injury timelines and random draws
  const ow={};for(const p of D.players)if(txIsOut(p)||txOW()[p.id]!=null)ow[p.id]=txMiss(p);
  while(typeof simBusy!=="undefined"&&simBusy)await new Promise(r=>setTimeout(r,200));
  const scen=[...[...give].map(id=>[id,t]),...[...get].map(id=>[id,me]),...mine.drops.map(p=>[p.id,0]),...theirs.drops.map(p=>[p.id,0])];
  const base=await simRun(null,ow),after=await simRun(scen,ow);
  const i=base.teams.indexOf(me),j=base.teams.indexOf(t);
  const nm=id=>(D.players.find(p=>p.id===id)||{}).n||id;
  TX.res={effIso,mine,theirs,win,give:[...give].map(nm),get:[...get].map(nm),t,
    odds:{po:[base.po[i],after.po[i]],title:[base.title[i],after.title[i]],wins:[base.wins[i],after.wins[i]],tpo:[base.po[j],after.po[j]],ttitle:[base.title[j],after.title[j]]}};
  TX.busy=false;renderTradeLab();
  const o=$("#txlabOut");if(o)o.scrollIntoView({behavior:reduce?"auto":"smooth",block:"nearest"});
}

function txOffers(){return (D.league_pending||[]).filter(c=>/TRADE/.test(c.type||"")&&c.items.some(i=>i.to==D.me||i.frm==D.me))}
function txLoad(c){const other=c.items.map(i=>i.frm==D.me?i.to:i.frm).find(x=>x&&x!=D.me);
  TX.team=+other;TX.give=new Set(c.items.filter(i=>i.frm==D.me).map(i=>i.pid));TX.get=new Set(c.items.filter(i=>i.to==D.me).map(i=>i.pid));TX.res=null;txAnalyze()}

function renderTradeLab(){
  const el=$("#txlab");if(!el||!D||!D.sim||!D.sim.gpw)return;
  const me=D.me,T=D.teams,others=Object.keys(T).map(Number).filter(t=>t!=me);
  if(TX.team==null)TX.team=others[0];
  const offers=txOffers();
  const mine=D.players.filter(p=>p.t==me).sort((a,b)=>txFull(b)-txFull(a));
  const theirs=D.players.filter(p=>p.t==TX.team).sort((a,b)=>txFull(b)-txFull(a));
  const chip=(p,set,k)=>`<button type="button" class="pchip ${set.has(p.id)?"on":""}" data-${k}="${p.id}">${esc(p.n)}<small>${esc(p.tm)} · ${txFull(p).toFixed(0)}${p.inj?` · ${esc(injWord(p.inj))}`:""}</small></button>`;
  const hurt=[...TX.give,...TX.get].map(id=>D.players.find(p=>p.id===id)).filter(p=>p&&txIsOut(p));
  const effOpts=[[0,"Today"],[1,"Tomorrow"],[2,"In 2 days"],[3,"In 3 days"]];
  el.innerHTML=`<div class="txlab">
    <div class="eyebrow">Trade lab</div><h3 style="margin:2px 0 12px;font:500 19px var(--sans)">Is this trade good for you, now and later?</h3>
    ${offers.length?`<div class="txoffers">${offers.map((c,k)=>{const get=c.items.filter(i=>i.to==me).map(i=>esc(i.n)),give=c.items.filter(i=>i.frm==me).map(i=>esc(i.n));const who=c.items.map(i=>i.frm==me?i.to:i.frm).find(x=>x&&x!=me);
      return `<button type="button" class="txoffer" data-offer="${k}"><span class="eyebrow">${c.mine?"Your offer to":"Offer from"} ${esc((T[who]||{}).name||"")}</span><span>You get <b>${get.join(" + ")}</b> for <b>${give.join(" + ")}</b></span><span class="go">Analyze →</span></button>`}).join("")}</div>`:""}
    <div class="sbgrid"><div><div class="faint sbl">You give</div><div class="pchips">${mine.map(p=>chip(p,TX.give,"xtlg")).join("")}</div></div>
      <div><div class="faint sbl">You get from <select id="txTeamSel" aria-label="Trade partner">${others.map(t=>`<option value="${t}" ${t===TX.team?"selected":""}>${esc(T[t].name)}</option>`).join("")}</select></div><div class="pchips">${theirs.map(p=>chip(p,TX.get,"xtlr")).join("")}</div></div></div>
    <div class="txopts">
      <label class="faint">Trade clears <select id="txEff">${effOpts.map(([v,l])=>`<option value="${v}" ${v===TX.eff?"selected":""}>${l}</option>`).join("")}</select></label>
      ${hurt.map(p=>`<label class="faint">${esc(p.n)} back in <input type="number" min="0" max="30" step="1" value="${txWeeksOut(p)}" data-ow="${p.id}" aria-label="Weeks until ${esc(p.n)} returns"> wks</label>`).join("")}
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <button class="b primary" type="button" id="txGo" ${(TX.give.size||TX.get.size)&&!TX.busy?"":"disabled"}>${TX.busy?"Simulating…":"Analyze trade"}</button>
      ${TX.give.size||TX.get.size?`<button class="b" type="button" id="txClr">Clear</button>`:""}
      <span class="faint" style="font-size:12.5px">${TX.give.size} out · ${TX.get.size} in</span></div>
    <div id="txlabOut">${TX.res&&!TX.busy?txHTML(TX.res):""}</div></div>`;
  el.querySelectorAll("[data-offer]").forEach(b=>b.onclick=()=>txLoad(offers[+b.dataset.offer]));
  el.querySelectorAll("[data-xtlg]").forEach(b=>b.onclick=()=>{const id=+b.dataset.xtlg;TX.give.has(id)?TX.give.delete(id):TX.give.add(id);TX.res=null;renderTradeLab()});
  el.querySelectorAll("[data-xtlr]").forEach(b=>b.onclick=()=>{const id=+b.dataset.xtlr;TX.get.has(id)?TX.get.delete(id):TX.get.add(id);TX.res=null;renderTradeLab()});
  el.querySelectorAll("[data-ow]").forEach(i=>i.onchange=()=>{const o=txOW();o[i.dataset.ow]=Math.max(0,+i.value||0);txSaveOW(o);TX.res=null;renderTradeLab()});
  $("#txTeamSel").onchange=e=>{TX.team=+e.target.value;TX.get.clear();TX.res=null;renderTradeLab()};
  $("#txEff").onchange=e=>{TX.eff=+e.target.value;TX.res=null;renderTradeLab()};
  $("#txGo").onclick=txAnalyze;
  const c=$("#txClr");if(c)c.onclick=()=>{TX.give.clear();TX.get.clear();TX.res=null;renderTradeLab()};
}

function txHTML(r){
  const M=r.mine,Th=r.theirs,O=r.odds,T=D.teams;
  const dv=(a,b,dec=0)=>{const v=+(b-a).toFixed(dec);return `<span class="${v>0.5?"up":v<-0.5?"down":"faint"}">${v>=0?"+":"−"}${Math.abs(v).toFixed(dec)}</span>`};
  const dp=(a,b)=>{const v=+((b-a)*100).toFixed(1);return `<span class="${v>0.4?"up":v<-0.4?"down":"faint"}">${v>=0?"+":"−"}${Math.abs(v).toFixed(1)}</span>`};
  const row=(l,a,b,f=x=>Math.round(x),d=dv)=>`<tr><td>${l}</td><td>${f(a)}</td><td>${f(b)}</td><td>${d(a,b)}</td></tr>`;
  const P=x=>pct1(x);
  const wk=M.wk[1]-M.wk[0],nx=M.next[1]-M.next[0],ros=M.ros[1]-M.ros[0],pw=(M.ros[1]-M.ros[0])/Math.max(1,M.rem);
  const dt=O.title[1]-O.title[0],dpo=O.po[1]-O.po[0];
  const now=wk+nx,later=dt*100*1.5+dpo*100*.5+pw/4; // the title is what counts most; points per week as a tiebreak
  const nowW=now>8?"helps":now<-8?"hurts":"barely moves";const latW=later>1?"helps":later<-1?"hurts":"barely moves";
  const head=latW==="helps"&&nowW!=="hurts"?`<b class="up">Accept-worthy.</b> It ${nowW==="helps"?"helps now and":"barely changes this week but"} helps your season.`
    :latW==="helps"?`<b class="up">Short-term pain, long-term gain.</b> It costs you points the next couple of weeks but improves your season.`
    :latW==="hurts"&&nowW==="helps"?`<b class="down">Win-now move that costs you later.</b> More points soon, worse odds over the season.`
    :latW==="hurts"?`<b class="down">Decline.</b> It hurts your season${nowW==="hurts"?" and your next couple of weeks":""}.`
    :`<b>About even.</b> It ${nowW==="helps"?"gives you a short-term boost":nowW==="hurts"?"costs you a little short term":"barely moves anything"} and doesn't change your season much.`;
  const drops=(D_,who,me)=>D_.length?`${who} ${me?"would":"would"} be over the ${TX_ACTIVE}-man active limit, so ${me?"you'd":"they'd"} drop the weakest player: ${D_.map(p=>`<b>${esc(p.n)}</b> (${tlFullS(p)}/g)`).join(", ")}. That's counted in the numbers.`:"";
  const tn=esc(T[r.t].name);
  return `<div class="sbres txres">
    <p style="margin:0 0 12px">You give <b>${r.give.map(esc).join(", ")||"nothing"}</b>, get <b>${r.get.map(esc).join(", ")||"nothing"}</b>. ${head}</p>
    <div class="txcols">
      <div><div class="eyebrow">Right now</div>
        <table class="tbl txtb"><thead><tr><th></th><th>Without</th><th>With</th><th>+/−</th></tr></thead><tbody>
        ${row(`Rest of this week <small class="faint">from ${fmtD(r.effIso)}</small>`,M.wk[0],M.wk[1])}
        ${r.win?row("Win this week",r.win[0],r.win[1],P,dp):""}
        ${row(`Next week <small class="faint">wk ${D.sim.cur+1}</small>`,M.next[0],M.next[1])}
        </tbody></table></div>
      <div><div class="eyebrow">Long term</div>
        <table class="tbl txtb"><thead><tr><th></th><th>Without</th><th>With</th><th>+/−</th></tr></thead><tbody>
        ${row(`Rest of season <small class="faint">${M.rem} wks</small>`,M.ros[0],M.ros[1])}
        ${row("Per week",M.ros[0]/Math.max(1,M.rem),M.ros[1]/Math.max(1,M.rem),x=>x.toFixed(0),(a,b)=>dv(a,b,1))}
        ${row("Playoff weeks",M.po[0],M.po[1])}
        ${row("Playoffs",O.po[0],O.po[1],P,dp)}
        ${row("Title",O.title[0],O.title[1],P,dp)}
        ${row("Wins",O.wins[0],O.wins[1],x=>x.toFixed(1),(a,b)=>dv(a,b,1))}
        </tbody></table></div>
    </div>
    ${M.drops.length?`<p class="faint" style="margin:8px 0 0;font-size:12.5px">${drops(M.drops,"You",1)}</p>`:""}
    <p class="faint" style="margin:10px 0 0;font-size:12.5px"><b>${tn}</b>: rest of season ${dv(Th.ros[0],Th.ros[1])} points, playoffs ${P(O.tpo[0])} → ${P(O.tpo[1])}, title ${P(O.ttitle[0])} → ${P(O.ttitle[1])}. ${drops(Th.drops,tn,0)}</p>
    <p class="faint" style="margin:8px 0 0;font-size:12.5px">This week is played day by day through your real lineup slots, starting the day the trade clears. Later weeks use each NBA team's real games per week and your lineup capacity. Injured players come back when you set above. Odds come from ${SIM_N.toLocaleString()} simulated seasons run with and without the trade on the same random draws.</p>
  </div>`;
}
