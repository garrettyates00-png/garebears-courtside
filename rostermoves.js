/* Moves to make: suggested pickups (already accounting for injuries and your pending claims), each with an
   Execute button, plus every available player with Add. Adding opens a short sheet: pick who to drop (or use an
   open spot, or move an OUT player to IR first), confirm, and roster.yml makes the move on ESPN. */
let RMQ=null;  // request in flight
const rmName=id=>((D.players.find(p=>p.id===+id)||(D.fa||[]).find(f=>f.id===+id)||{}).n)||"";
const rmWhen=f=>f.st==="WAIVERS"?`Waiver claim${f.wclear?`, clears ${f.wclear}`:""}`:"Free agent, added right away";

/* ---------- who plays when (for the free-agent list and the drop picker) ---------- */
const rmT=()=>TODAY();
function rmGame(x){const g=typeof gameOf==="function"?gameOf(x):null;return g||null}
function rmPlaysToday(x){return x.days?x.days.includes(rmT()):!!x.today}
function rmToday(x){   // {k: today|live|done|off, t: label}
  if(!rmPlaysToday(x))return {k:"off",t:"Off today"};
  const g=rmGame(x);if(g&&g.state==="in")return {k:"live",t:"Playing now"};if(g&&g.state==="post")return {k:"done",t:"Played today"};
  const tm=g&&g.date?new Date(g.date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";return {k:"today",t:"Today"+(tm?" "+tm:"")}}
function rmLeft(x){return x.days?x.days.length:(x.g||0)}                       // games left this week, today included
function rmNext(x){const S=D.sim||{};return ((S.gpw||{})[x.tm]||{})[(D.period||0)+1]??null}
// In this league an add made during the day shows up on ESPN's roster from the next day (Keegan Murray, Nov 15:
// added before his game, still not on today's roster), so a pickup never counts today.
function rmUsableToday(f){return false}
const rmEl=(p,slot)=>{const e=p.el||[];if(slot==="UTIL")return e.some(x=>["PG","SG","SF","PF","C"].includes(x));if(slot==="G")return e.includes("PG")||e.includes("SG");if(slot==="F")return e.includes("SF")||e.includes("PF");return e.includes(slot)};
// best possible starting lineup points for one day: players who play that day, matched to slots by eligibility
function rmLineup(ps){const slots=D.slots,own=new Array(slots.length).fill(null);let pts=0;
  const pl=ps.slice().sort((a,b)=>b.pa-a.pa);
  const tryP=(p,seen)=>{for(let i=0;i<slots.length;i++){if(seen[i]||!rmEl(p,slots[i]))continue;seen[i]=1;if(own[i]==null||tryP(own[i],seen)){own[i]=p;return true}}return false};
  for(const p of pl)if(tryP(p,{}))pts+=p.pa;return {pts,own}}
function rmTodayPool(ps){return ps.filter(p=>p.slot!=="IR"&&!/OUT|RESERVE|SUSP/.test(p.inj||"")&&rmToday(p).k==="today")}
/* how good is dropping each of my players for this add: today's lineup with him swapped out, next week's games, long-run value */
/* Expected lineup points per week for a roster when each player plays a given share of days: sampled days (the same
   random draws for everyone, so comparisons are fair), each filled with the best legal lineup. This is what catches
   position crowding: a fifth center mostly lands on the bench or in a UTIL spot someone better already holds. */
function rmHash(id,k){let h=(id*2654435761+k*40503)>>>0;h^=h>>>15;h=Math.imul(h,2246822507)>>>0;h^=h>>>13;return (h>>>0)/4294967296}
function rmExp(ps,pf,n=48){let tot=0;for(let k=0;k<n;k++){const day=ps.filter(p=>{const q=pf(p);return q>0&&rmHash(p._seat||p.id,k)<q});tot+=rmLineup(day).pts}return tot/n*7}   // the added player takes the dropped player's draws, so the comparison isn't noise
function rmStart(ps,pf,who,n=48){let g=0,st=0;for(let k=0;k<n;k++){const day=ps.filter(p=>{const q=pf(p);return q>0&&rmHash(p._seat||p.id,k)<q});if(!day.includes(who))continue;g++;if(rmLineup(day).own.includes(who))st++}return g?st/g:1}
function rmGpw(p,w){const g=((D.sim||{}).gpw||{})[p.tm]||{};return g[w]??g[String(w)]??3.4}
function rmAvgG(p){const g=((D.sim||{}).gpw||{})[p.tm]||{},S=D.sim||{},ws=[];for(let w=(D.period||0)+1;w<=(S.reg||D.period+8);w++)if(g[w]!=null)ws.push(g[w]);return ws.length?ws.reduce((a,b)=>a+b,0)/ws.length:3.4}
/* How much the rest of this week matters right now: a close matchup makes this week's points worth more, a decided one
   (either way) makes them worth about the same as any other points. */
function rmStakes(){
  const live=typeof isLiveWeek==="function"&&isLiveWeek(),days=(D.all_days||[]).filter(d=>d>=rmT());
  if(!D.opp||!days.length)return {w:1,txt:"",days:0};
  let wp=.5,gap=0;try{wp=winProb(D.me,D.opp);gap=finalMean(D.me)-finalMean(D.opp)}catch(e){}
  const close=Math.max(0,1-Math.abs(wp-.5)/.45),w=1+3*close;
  const left=days.length===1?"with just today left":`with ${days.length} days left`;
  const txt=wp<.05?`This week is basically gone (${Math.round(wp*100)}% to win), so moves are judged on next week and beyond.`
    :wp>.95?`This week is basically won (${Math.round(wp*100)}%), so moves are judged on next week and beyond.`
    :`You're ${gap<0?"down":"up"} about ${Math.abs(Math.round(gap))} ${left} (${Math.round(wp*100)}% to win). Points this week count ${w.toFixed(1)}× in these picks.`;
  return {w,txt,wp,gap,days:days.length}}
/* ESPN caps how many players of each default position you can roster (e.g. 4 centers). An add has to fit under it. */
function rmLim(pos){return ((D.roster||{}).pos_limits||{})[pos]||0}
function rmPosOK(f,drop){const L=rmLim(f.pos);if(!L||!f.pos)return true;return P(D.me).filter(p=>p.pos===f.pos&&p!==drop).length+1<=L}
function rmPosCount(pos){return P(D.me).filter(p=>p.pos===pos).length}
function rmAdvice(f,ST){
  ST=ST||rmStakes();
  const all=P(D.me),mine=all.filter(p=>p.slot!=="IR");   // IR spots don't open an active spot, so they can't make room for an add
  const healthy=p=>!/OUT|RESERVE|SUSP/.test(p.inj||"");
  const usable=rmUsableToday(f),fa={...f,slot:"BE",days:usable?[rmT()]:[]};
  // today: the real lineup for today's games
  const base=rmLineup(rmTodayPool(all)).pts;
  // rest of this week after today: my players by their real schedule, his games spread over the days he's eligible
  const rest=(D.all_days||[]).filter(d=>d>rmT()),wday=f.st==="WAIVERS"&&f.wday?f.wday:null,okDays=rest.filter(d=>!wday||d>wday);
  const fLeft=Math.max(0,(f.g||0)-(rmPlaysToday(f)?1:0)),fq=okDays.length&&rest.length?Math.min(1,fLeft/rest.length):0;
  const restVal=(ps,withF)=>rest.reduce((s,d,i)=>{const pool=ps.filter(p=>p.slot!=="IR"&&healthy(p)&&(p.days||[]).includes(d));
    if(!withF||!okDays.includes(d))return s+rmLineup(pool).pts;let t=0;for(let k=0;k<12;k++)t+=rmLineup(rmHash(f.id,k*7+i)<fq?pool.concat([fa]):pool).pts;return s+t/12},0);
  const restBase=rest.length?restVal(all,false):0;
  const nw=(D.period||0)+1,nxt=p=>healthy(p)||(typeof txWeeksOut==="function"&&txWeeksOut(p)<=1)?rmGpw(p,nw)/7:0;
  const nBase=rmExp(all,nxt);
  const H=Math.max(0,((D.sim||{}).reg||nw+6)-nw),   // the rest of the regular season after next week
    lr=p=>{const out=healthy(p)?0:(typeof txWeeksOut==="function"?txWeeksOut(p):4);return rmAvgG(p)/7*Math.max(0,1-Math.max(0,out-1)/Math.max(1,H))};
  const lBase=rmExp(all,lr);
  return mine.map(p=>{
    const ros=all.filter(x=>x!==p),after=ros.concat([{...f,slot:"BE",_seat:p.id}]);
    const today=(usable?rmLineup(rmTodayPool(ros.concat([fa]))).pts:rmLineup(rmTodayPool(ros)).pts)-base;
    const restW=rest.length?restVal(ros,true)-restBase:0;
    const next=rmExp(after,nxt)-nBase,long=(rmExp(after,lr)-lBase)*H*.6;   // discounted: projections drift and you can re-pick later
    const fx=after[after.length-1],sr=rmStart(after,nxt,fx);   // how often he'd actually be in your lineup when he plays
    const crowd=sr<.7;
    const ok=rmPosOK(f,p),score=ok?ST.w*(today+restW)+next+long:-1e6;   // over a position cap: ESPN won't allow it
    return {p,today,restW,next,long,per:f.pa-p.pa,score,crowd,sr,ok,hurt:!healthy(p)}}).sort((a,b)=>b.score-a.score);
}
/* the moves worth making right now, across every available player */
let RMS={key:null,list:null,busy:false};
function rmSuggest(done){
  if(D.owner!=null&&D.me!==D.owner)return;  // moves act on the owner's roster only; never compute them for another team
  const rmKey=()=>D.pulled+"|"+D.me+"|"+rmT()+"|"+Object.values(LV.games||{}).map(g=>g.state).join("");
  const key=rmKey();
  if(RMS.key===key&&RMS.list)return done(RMS.list);if(RMS.busy)return;RMS.busy=true;
  const ST=rmStakes(),pool=(D.fa||[]).filter(f=>!f.claimed&&!/OUT|RESERVE|SUSP/.test(f.inj||""))
    .sort((a,b)=>(rmUsableToday(b)-rmUsableToday(a))||(b.pa-a.pa)).slice(0,24);
  const out=[];let i=0;
  const step=()=>{const t0=performance.now();
    while(i<pool.length&&performance.now()-t0<25){const f=pool[i++],a=rmAdvice(f,ST)[0];if(a&&a.score>6)out.push({f,a})}
    if(i<pool.length)return setTimeout(step,0);
    out.sort((x,y)=>y.a.score-x.a.score);const used=new Set(),pick=[];
    for(const o of out){if(used.has(o.a.p.id))continue;used.add(o.a.p.id);pick.push(o);if(pick.length===3)break}
    RMS={key,list:{pick,ST,all:out},busy:false};if(rmKey()!==key)return rmSuggest(done);done(RMS.list)};
  step();
}
function rmReason(f,a,ST){const L=x=>esc(last(x));const r=[];
  if(a.today>0.5)r.push(`${L(f.n)} starts for you today: <b class="up">+${Math.round(a.today)}</b>`);else if(a.today<-0.5)r.push(`costs <b class="down">${Math.round(a.today)}</b> today (${L(a.p.n)} plays)`);
  if(Math.abs(a.restW)>=1)r.push(`rest of this week ${a.restW>0?"+":"−"}${Math.abs(Math.round(a.restW))}`);
  r.push(`next week ${a.next>=0?"+":"−"}${Math.abs(Math.round(a.next))}`);
  r.push(`long run ${a.long>=0?"+":"−"}${Math.abs(Math.round(a.long))}`);
  r.push(a.crowd?`<span class="down">crowded at ${esc(f.pos)}: he'd start only ${Math.round(a.sr*100)}% of his games</span>`:`starts ${Math.round(a.sr*100)}% of his games`);
  return r.join(" · ")}

function renderMovesX(){
  const R=D.roster||{},M=D.moves||[];
  const pend=(D.league_pending||[]).filter(c=>c.mine);
  const claimTxt=pend.length?`<div class="rmnote"><b>Pending:</b> ${pend.map(c=>c.items.map(i=>`${i.kind==="ADD"?"add":"drop"} ${esc(i.n)}`).join(", ")+(c.when?` <span class="faint">(${esc(c.when)})</span>`:"")).join(" · ")}. Suggestions already assume these go through.</div>`:"";
  const room=R.active_max?`<div class="rmroom"><span><b>${R.active_now}</b>/${R.active_max} active</span><span><b>${R.ir_used}</b>/${R.ir_max} IR</span>${R.room>0?`<span class="up">${R.room} open spot${R.room>1?"s":""} after claims</span>`:`<span class="faint">Full after claims</span>`}${R.ir_free&&R.ir_cands&&R.ir_cands.length?`<span>${esc(rmName(R.ir_cands[0]))} can go to IR</span>`:""}</div>`:"";
  const card=(m,i)=>{const f=(D.fa||[]).find(x=>x.id===m.add_id)||{st:m.add_st,wclear:m.add_clear};
    const how=m.drop?`drop <b>${esc(m.drop)}</b>${m.drop_inj?" "+injTag(m.drop_inj):""}`:m.ir?`move <b>${esc(m.ir)}</b> to IR to make room`:"use your open roster spot";
    return `<div class="rmcard"><div class="rmhead"><div><b>Add ${esc(m.add)}</b> <span class="faint">${esc(m.addtm||"")} · ${m.addval}/g</span>${m.add_inj?" "+injTag(m.add_inj):""}<div class="rmsub">${how}</div></div>
      <span class="rmgain up">+${Math.round(m.net)}</span></div>
      <div class="rmwhy">${m.games} game${m.games===1?"":"s"} for him from ${esc(m.from_day)}${m.drop?` vs ${m.dropgames} for ${esc(last(m.drop))}`:""}. About +${Math.round(m.gain)} this week${m.ros>0?`, minus ${Math.round(m.ros)} in long-run value`:""}. <span class="faint">${esc(rmWhen(f))}.</span></div>
      <div class="rmbtns"><button class="b primary" type="button" data-rmx="${i}">Execute</button></div></div>`};
  $("#moves").outerHTML=`<div id="moves" class="rmwrap">${room}${claimTxt}
    <div id="rmSug"><div class="simload"><span></span>Finding the best moves for right now…</div></div>
    <button class="b" type="button" id="rmDropOnly" style="justify-self:start">Drop a player…</button></div>`;
  rmSuggest(L=>{const el=$("#rmSug");if(!el)return;const ST=L.ST;
    el.innerHTML=(ST.txt?`<div class="rmstake ${ST.w>2?"hot":""}">${ST.w>2?"🔥 ":""}${esc(ST.txt)}</div>`:"")+(L.pick.length?L.pick.map((o,i)=>{const f=o.f,a=o.a,t=rmToday(f);
      return `<div class="rmcard"><div class="rmhead"><div><b>Add ${esc(f.n)}</b> <span class="faint">${esc(f.tm)} · ${esc(f.pos)} · ${f.pa.toFixed(1)}/g</span>${f.inj?" "+injTag(f.inj):""}
          <div class="rmsub">drop <b>${esc(a.p.n)}</b>${a.p.inj?" "+injTag(a.p.inj):""} <span class="faint">${esc(a.p.pos||"")} · ${a.p.pa.toFixed(1)}/g</span></div>
          <div class="rmchips"><span class="tchip ${t.k}">${esc(t.t)}</span><span class="gchip">${rmLeft(f)} left this wk</span><span class="gchip">${rmNext(f)??"–"} next wk</span>${rmLim(f.pos)?`<span class="gchip">${esc(f.pos)} ${rmPosCount(f.pos)-(a.p.pos===f.pos?1:0)+1}/${rmLim(f.pos)} after</span>`:""}</div></div>
        <span class="rmgain up">+${Math.round(a.score)}</span></div>
        <div class="rmwhy">${rmReason(f,a,ST)}. <span class="faint">${esc(rmWhen(f))}.</span></div>
        <div class="rmbtns"><button class="b primary" type="button" data-rms="${i}">Execute</button></div></div>`}).join("")
      :`<p class="mute" style="margin:0">No pickup is worth it right now${ST.w>2?", even with this week on the line":""}. Every swap either doesn't fit your lineup or costs more later than it gains.</p>`);
    el.querySelectorAll("[data-rms]").forEach(b=>b.onclick=()=>{const o=L.pick[+b.dataset.rms];rmSheet({add:o.f.id,drop:o.a.p.id,ir:null})});
    // and the per-player hint in the list
    for(const tr of document.querySelectorAll("#fa tbody tr")){const f=D.fa[+tr.dataset.k];if(!f)continue;tr.querySelector(".fadrop")?.remove();
      const o=L.all.find(x=>x.f.id===f.id);if(o){const d=document.createElement("div");d.className="fadrop";d.innerHTML=`Swap for <b>${esc(last(o.a.p.n))}</b> <span class="up">+${Math.round(o.a.score)}</span>`;tr.children[0].appendChild(d)}}});
  $("#rmDropOnly").onclick=()=>rmSheet({add:null,drop:null,ir:null,dropOnly:true});
  // available players: an Add button on every row
  const tb=$("#fa");if(tb){
    const hr0=tb.querySelector("thead tr");if(hr0&&!hr0.querySelector(".rmth")){const a=document.createElement("th");a.className="rmth";a.textContent="Today";hr0.children[1].after(a);
      hr0.children[3].textContent="Left";hr0.children[3].title="Games left this week, today included";const n=document.createElement("th");n.className="r";n.textContent="Next wk";n.title="Games next week";hr0.children[3].after(n)}
    tb.querySelectorAll("tbody tr").forEach((tr,k)=>{const f=D.fa[k];if(!f||tr.dataset.k)return;tr.dataset.k=k;
      const t=rmToday(f),use=rmUsableToday(f);tr.classList.add("fa-"+t.k);if(t.k==="today")tr.classList.add("fa-use");
      const td=document.createElement("td");td.innerHTML=`<span class="tchip ${t.k}">${esc(t.t)}</span>${t.k==="today"&&f.st==="WAIVERS"?`<div class="faint" style="font-size:11px">claim won't clear in time</div>`:""}`;tr.children[1].after(td);
      const nx=document.createElement("td");nx.className="r num mute";const nv=rmNext(f);nx.textContent=nv==null?"–":nv;tr.children[3].after(nx);
});
    if(!$("#faFilt")){const bar=document.createElement("div");bar.id="faFilt";bar.className="fafilt";
      bar.innerHTML=`<button type="button" data-ff="all" class="on">All</button><button type="button" data-ff="today">Plays today</button><button type="button" data-ff="games">Most games</button><span class="faint">Green = has a game today. New adds join your roster tomorrow, so they won't score today.</span>`;
      tb.parentNode.insertBefore(bar,tb);
      bar.querySelectorAll("[data-ff]").forEach(b=>b.onclick=()=>{bar.querySelectorAll("[data-ff]").forEach(x=>x.classList.toggle("on",x===b));const k=b.dataset.ff,body=tb.querySelector("tbody"),rows=[...body.rows];
        rows.forEach(r=>{const f=D.fa[+r.dataset.k];r.hidden=k==="today"&&!rmPlaysToday(f)});
        rows.sort((a,c)=>{const fa=D.fa[+a.dataset.k],fc=D.fa[+c.dataset.k];return k==="games"?((rmLeft(fc)+(rmNext(fc)||0))-(rmLeft(fa)+(rmNext(fa)||0))||fc.pa-fa.pa):k==="today"?(rmUsableToday(fc)-rmUsableToday(fa))||fc.pa-fa.pa:(+a.dataset.k)-(+c.dataset.k)});
        rows.forEach(r=>body.appendChild(r))})}
    tb.querySelectorAll("tbody tr").forEach(tr=>{const f=D.fa[+tr.dataset.k];if(!f||tr.querySelector(".rmadd")||tr.querySelector(".rmclaimed"))return;
    const td=document.createElement("td");td.className="r";
    td.innerHTML=f.claimed?`<span class="faint rmclaimed" style="font-size:12px">claimed</span>`:`<button class="b rmadd" type="button" data-add="${f.id}">Add</button>`;tr.appendChild(td)});
    const hr=tb.querySelector("thead tr");if(hr&&!hr.querySelector(".rmh")){const th=document.createElement("th");th.className="r rmh";hr.appendChild(th)}
    tb.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>rmSheet({add:+b.dataset.add,drop:null,ir:null}))}
}

/* the confirm sheet */
function rmSheet(o){
  document.querySelector(".modal.rms")?.remove();
  const R=D.roster||{},mine=P(D.me).slice().sort((a,b)=>(a.slot==="IR")-(b.slot==="IR")||a.pa-b.pa);
  const f=o.add?(D.fa||[]).find(x=>x.id===o.add):null;
  const need=o.add?(R.room>0?0:1):0;   // a drop or IR move is needed when the roster is full
  const m=document.createElement("div");m.className="modal rms";
  const draw=()=>{
    const okPos=!f||rmPosOK(f,o.drop?D.players.find(p=>p.id===o.drop):null),ok=okPos&&(o.dropOnly?!!o.drop:(!need||o.drop||o.ir));
    const ST=rmStakes(),adv=f?rmAdvice(f,ST):null,best=adv&&adv[0]&&adv[0].score>0?adv[0].p.id:null,A=id=>adv&&adv.find(a=>a.p.id===id);
    const verdict=a=>!a?"":!a.ok?["keep",`Over ${esc(f.pos)} limit`]:a.p.id===best?["best","Best drop"]:a.score>0?["ok","Fine to drop"]:a.score>-15?["close","Close call"]:["keep","Keep"];
    const opt=p=>{const t=rmToday(p),a=A(p.id),v=verdict(a),nx=rmNext(p);
      const why=a?(a.ok?rmReason(f,a,ST):`Not allowed: you would have ${rmPosCount(f.pos)+1} ${esc(f.pos)} (limit ${rmLim(f.pos)}). Drop a ${esc(f.pos)} to add him.`):"";
      return `<button type="button" class="rmopt ${o.drop===p.id?"on":""} ${v?"v-"+v[0]:""}" data-d="${p.id}"><span><b>${esc(p.n)}</b>${injTag(p.inj)}${v?`<em class="verd ${v[0]}">${v[1]}</em>`:""}
          <small>${esc(p.tm)} · ${esc((p.el||[]).filter(x=>x.length<=2).join("/"))} · ${p.pa.toFixed(1)}/g${(R.claim_drop||[]).includes(p.id)?" · in a pending drop":""}</small>
          <span class="rmchips"><span class="tchip ${t.k}">${esc(t.t)}</span><span class="gchip">${rmLeft(p)} left this wk</span>${nx!=null?`<span class="gchip">${nx} next wk</span>`:""}</span>
          ${why?`<small class="rmwhy2">${why}</small>`:""}</span></button>`};
    const irOpts=(R.ir_cands||[]).map(id=>D.players.find(p=>p.id===id)).filter(Boolean);
    m.innerHTML=`<div class="box rmbox" role="dialog" aria-label="Roster move">
      <h2 style="margin:0">${o.dropOnly?"Drop a player":`Add ${esc(f?f.n:rmName(o.add))}`}</h2>
      ${f?`<p class="mute" style="margin:0;font-size:14px">${esc(f.tm)} · ${esc(f.pos)} · ${f.pa.toFixed(1)}/g · ${f.g} left this week${rmNext(f)!=null?` · ${rmNext(f)} next week`:""}${f.inj?" · "+esc(injWord(f.inj)):""}. ${esc(rmWhen(f))}.</p>
        <div class="rmchips"><span class="tchip ${rmToday(f).k}">${esc(rmToday(f).t)}</span>${rmToday(f).k==="today"?`<span class="tchip off">Joins your roster tomorrow, won't score today</span>`:""}</div>`:""}
      ${f&&rmLim(f.pos)&&!rmPosOK(f,null)?`<div class="rmstake hot">You're at the ${esc(f.pos)} limit (${rmPosCount(f.pos)}/${rmLim(f.pos)} by default position), so adding ${esc(last(f.n))} means dropping a ${esc(f.pos)}.</div>`:""}
      ${o.add?`<div class="rmstate">${R.room>0?`You have <b>${R.room}</b> open spot${R.room>1?"s":""}, so a drop is optional.`:`Your roster is full${(R.claim_add||[]).length?" once your pending claims go through":""}. Pick someone to drop${irOpts.length&&R.ir_free?", or move an OUT player to IR":""}.`}</div>`:""}
      ${o.add&&irOpts.length&&R.ir_free?`<div class="eyebrow">Move to IR instead</div><div class="rmopts">${irOpts.map(p=>`<button type="button" class="rmopt ${o.ir===p.id?"on":""}" data-ir="${p.id}"><span><b>${esc(p.n)}</b>${injTag(p.inj)}<small>${esc(p.tm)} · ${p.pa.toFixed(1)}/g · keeps him, frees a spot</small></span></button>`).join("")}</div>`:""}
      <div class="eyebrow">${o.dropOnly?"Who goes":"Drop"}${o.add&&!need?" (optional)":""}</div>
      ${ST.txt&&f?`<div class="rmstake ${ST.w>2?"hot":""}">${esc(ST.txt)}</div>`:""}${adv&&best?`<div class="rmbest">Best drop: <b>${esc(rmName(best))}</b>, about <b class="up">+${Math.round(adv[0].score)}</b>${adv[0].crowd?`. Careful: you're crowded at ${esc(f.pos)}, he'd start only ${Math.round(adv[0].sr*100)}% of his games`:""}.</div>`:adv?`<div class="rmbest keep">Nobody on your roster is a clear drop for ${esc(f.n)}. Everyone is worth more than him over the next couple of weeks.</div>`:""}
      <div class="rmopts rmscroll">${(adv?adv.map(a=>a.p):mine.filter(p=>p.slot!=="IR"||o.dropOnly)).map(opt).join("")}</div>
      <div class="rmsum">${o.add?`<span class="up">+ ${esc(f?f.n:rmName(o.add))}</span>`:""}${o.ir?`<span>${esc(rmName(o.ir))} → IR</span>`:""}${o.drop?`<span class="down">− ${esc(rmName(o.drop))}</span>`:""}</div>
      <p class="faint" style="margin:0;font-size:12.5px">Dropped players go to waivers, where any team can claim them. This saves to ESPN through GitHub and takes about a minute.</p>
      <div class="rmbtns"><button class="b" type="button" id="rmCancel">Cancel</button><button class="b primary" type="button" id="rmGo" ${ok?"":"disabled"}>${o.dropOnly?"Drop":f&&f.st==="WAIVERS"?"Place claim":"Make move"}</button></div></div>`;
    m.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{const id=+b.dataset.d;o.drop=o.drop===id?null:id;if(o.drop)o.ir=null;draw()});
    m.querySelectorAll("[data-ir]").forEach(b=>b.onclick=()=>{const id=+b.dataset.ir;o.ir=o.ir===id?null:id;if(o.ir)o.drop=null;draw()});
    m.querySelector("#rmCancel").onclick=()=>m.remove();
    m.querySelector("#rmGo").onclick=()=>{m.remove();rmRun(o)};
  };
  draw();document.body.appendChild(m);m.addEventListener("click",e=>{if(e.target===m)m.remove()});
}

async function rmRun(o){
  if(RMQ){toast("A roster move is already running.");return}
  if(!getTok()){tokenDialog("roster.yml");return}
  const req="r-"+Date.now().toString(36);RMQ=req;
  const what=[o.add&&`add ${rmName(o.add)}`,o.ir&&`${rmName(o.ir)} to IR`,o.drop&&`drop ${rmName(o.drop)}`].filter(Boolean).join(", ");
  let log=null;
  const ok=await dispatch("roster.yml",{req,add:o.add?String(o.add):"",drop:o.drop?String(o.drop):"",ir:o.ir?String(o.ir):""},"Saving to ESPN: "+what,
    async()=>{try{const L=await (await fetch("roster_log.json?t="+Date.now(),{cache:"no-store"})).json();log=L.find(x=>x.req===req);if(log){await load(true);return true}}catch(e){}return false});
  RMQ=null;
  if(log)toast(log.status==="done"?`Done: ${what}.`:log.status==="claim"?`Claim placed: ${what}. It processes when waivers clear.`:"ESPN didn't take it: "+(log.error||log.status));
  else if(ok===false)toast("Still saving. It'll show up in a minute.");
}
/* hook into the Moves section render */
const _rw=renderWire;renderWire=function(){_rw();renderMovesX()};
