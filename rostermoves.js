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
function rmUsableToday(f){const t=rmToday(f);return f.st!=="WAIVERS"&&t.k==="today"}
const rmEl=(p,slot)=>{const e=p.el||[];if(slot==="UTIL")return e.some(x=>["PG","SG","SF","PF","C"].includes(x));if(slot==="G")return e.includes("PG")||e.includes("SG");if(slot==="F")return e.includes("SF")||e.includes("PF");return e.includes(slot)};
// best possible starting lineup points for one day: players who play that day, matched to slots by eligibility
function rmLineup(ps){const slots=D.slots,own=new Array(slots.length).fill(null);let pts=0;
  const pl=ps.slice().sort((a,b)=>b.pa-a.pa);
  const tryP=(p,seen)=>{for(let i=0;i<slots.length;i++){if(seen[i]||!rmEl(p,slots[i]))continue;seen[i]=1;if(own[i]==null||tryP(own[i],seen)){own[i]=p;return true}}return false};
  for(const p of pl)if(tryP(p,{}))pts+=p.pa;return {pts,own}}
function rmTodayPool(ps){return ps.filter(p=>p.slot!=="IR"&&!/OUT|RESERVE|SUSP/.test(p.inj||"")&&rmToday(p).k==="today")}
/* how good is dropping each of my players for this add: today's lineup with him swapped out, next week's games, long-run value */
function rmAdvice(f){
  const mine=P(D.me).filter(p=>p.slot!=="IR");   // IR spots don't open an active spot, so they can't make room for an add
  const usable=rmUsableToday(f),fa={...f,slot:"BE",days:usable?[rmT()]:[]};
  const base=rmLineup(rmTodayPool(P(D.me))).pts,nf=rmNext(f)??3.3;
  return mine.map(p=>{
    const rest=P(D.me).filter(x=>x!==p);const today=usable?rmLineup(rmTodayPool(rest.concat([fa]))).pts-base:rmLineup(rmTodayPool(rest)).pts-base;
    const np=rmNext(p)??3.3,hurt=/OUT|RESERVE/.test(p.inj||"");
    const next=nf*f.pa-(hurt?0:np*p.pa),per=f.pa-p.pa;
    // long run: the per-game gap over the rest of the season, discounted (projections drift), counting only the weeks he's healthy
    const S=D.sim||{},wl=Math.max(0,(S.reg||D.period+6)-(D.period||0)-1),out=hurt&&typeof txWeeksOut==="function"?txWeeksOut(p):0;
    const long=(p.pa*Math.max(0,Math.min(wl,6)-out)-f.pa*Math.min(wl,6))*3.4*.45;
    const score=today+next-long;
    return {p,today,next,per,score,hurt,long}}).sort((a,b)=>b.score-a.score);
}

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
    ${M.length?M.map(card).join(""):`<p class="mute" style="margin:0">No pickup is worth it right now. Players at or above waiver level aren't suggested as drops, injured players and anyone in a pending claim are skipped.</p>`}
    <button class="b" type="button" id="rmDropOnly" style="justify-self:start">Drop a player…</button></div>`;
  document.querySelectorAll("[data-rmx]").forEach(b=>b.onclick=()=>{const m=M[+b.dataset.rmx];rmSheet({add:m.add_id,drop:m.drop_id,ir:m.ir_id})});
  $("#rmDropOnly").onclick=()=>rmSheet({add:null,drop:null,ir:null,dropOnly:true});
  // available players: an Add button on every row
  const tb=$("#fa");if(tb){
    const hr0=tb.querySelector("thead tr");if(hr0&&!hr0.querySelector(".rmth")){const a=document.createElement("th");a.className="rmth";a.textContent="Today";hr0.children[1].after(a);
      hr0.children[3].textContent="Left";hr0.children[3].title="Games left this week, today included";const n=document.createElement("th");n.className="r";n.textContent="Next wk";n.title="Games next week";hr0.children[3].after(n)}
    tb.querySelectorAll("tbody tr").forEach((tr,k)=>{const f=D.fa[k];if(!f||tr.dataset.k)return;tr.dataset.k=k;
      const t=rmToday(f),use=rmUsableToday(f);tr.classList.add("fa-"+t.k);if(use)tr.classList.add("fa-use");
      const td=document.createElement("td");td.innerHTML=`<span class="tchip ${t.k}">${esc(t.t)}</span>${t.k==="today"&&f.st==="WAIVERS"?`<div class="faint" style="font-size:11px">claim won't clear in time</div>`:""}`;tr.children[1].after(td);
      const nx=document.createElement("td");nx.className="r num mute";const nv=rmNext(f);nx.textContent=nv==null?"–":nv;tr.children[3].after(nx);
      // the best drop for him, if any is worth it
      if(!f.claimed&&!/OUT|RESERVE/.test(f.inj||"")){const a=rmAdvice(f)[0];if(a&&a.score>0){const d=document.createElement("div");d.className="fadrop";d.innerHTML=`Swap for <b>${esc(last(a.p.n))}</b> <span class="up">+${Math.round(a.score)}</span>`;tr.children[0].appendChild(d)}}});
    if(!$("#faFilt")){const bar=document.createElement("div");bar.id="faFilt";bar.className="fafilt";
      bar.innerHTML=`<button type="button" data-ff="all" class="on">All</button><button type="button" data-ff="today">Plays today</button><button type="button" data-ff="games">Most games</button><span class="faint">Green = can be added and played today</span>`;
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
    const ok=o.dropOnly?!!o.drop:(!need||o.drop||o.ir);
    const adv=f?rmAdvice(f):null,best=adv&&adv[0]&&adv[0].score>0?adv[0].p.id:null,A=id=>adv&&adv.find(a=>a.p.id===id);
    const verdict=a=>!a?"":a.p.id===best?["best","Best drop"]:a.score>0?["ok","Fine to drop"]:a.score>-15?["close","Close call"]:["keep","Keep"];
    const opt=p=>{const t=rmToday(p),a=A(p.id),v=verdict(a),nx=rmNext(p);
      const why=a?[a.today>0.5?`${esc(last(f.n))} starts today: +${Math.round(a.today)}`:a.today<-0.5?`costs ${Math.round(-a.today)} today`:"",
        a.per>=0?`${esc(last(f.n))} +${a.per.toFixed(1)}/g`:`he's ${(-a.per).toFixed(1)}/g better`].filter(Boolean).join(" · "):"";
      return `<button type="button" class="rmopt ${o.drop===p.id?"on":""} ${v?"v-"+v[0]:""}" data-d="${p.id}"><span><b>${esc(p.n)}</b>${injTag(p.inj)}${v?`<em class="verd ${v[0]}">${v[1]}</em>`:""}
          <small>${esc(p.tm)} · ${esc((p.el||[]).filter(x=>x.length<=2).join("/"))} · ${p.pa.toFixed(1)}/g${(R.claim_drop||[]).includes(p.id)?" · in a pending drop":""}</small>
          <span class="rmchips"><span class="tchip ${t.k}">${esc(t.t)}</span><span class="gchip">${rmLeft(p)} left this wk</span>${nx!=null?`<span class="gchip">${nx} next wk</span>`:""}</span>
          ${why?`<small class="rmwhy2">${why}</small>`:""}</span></button>`};
    const irOpts=(R.ir_cands||[]).map(id=>D.players.find(p=>p.id===id)).filter(Boolean);
    m.innerHTML=`<div class="box rmbox" role="dialog" aria-label="Roster move">
      <h2 style="margin:0">${o.dropOnly?"Drop a player":`Add ${esc(f?f.n:rmName(o.add))}`}</h2>
      ${f?`<p class="mute" style="margin:0;font-size:14px">${esc(f.tm)} · ${esc(f.pos)} · ${f.pa.toFixed(1)}/g · ${f.g} left this week${rmNext(f)!=null?` · ${rmNext(f)} next week`:""}${f.inj?" · "+esc(injWord(f.inj)):""}. ${esc(rmWhen(f))}.</p>
        <div class="rmchips"><span class="tchip ${rmToday(f).k}">${esc(rmToday(f).t)}</span>${rmUsableToday(f)?`<span class="tchip use">Can play for you today</span>`:rmToday(f).k==="today"?`<span class="tchip off">Won't count today (waivers)</span>`:""}</div>`:""}
      ${o.add?`<div class="rmstate">${R.room>0?`You have <b>${R.room}</b> open spot${R.room>1?"s":""}, so a drop is optional.`:`Your roster is full${(R.claim_add||[]).length?" once your pending claims go through":""}. Pick someone to drop${irOpts.length&&R.ir_free?", or move an OUT player to IR":""}.`}</div>`:""}
      ${o.add&&irOpts.length&&R.ir_free?`<div class="eyebrow">Move to IR instead</div><div class="rmopts">${irOpts.map(p=>`<button type="button" class="rmopt ${o.ir===p.id?"on":""}" data-ir="${p.id}"><span><b>${esc(p.n)}</b>${injTag(p.inj)}<small>${esc(p.tm)} · ${p.pa.toFixed(1)}/g · keeps him, frees a spot</small></span></button>`).join("")}</div>`:""}
      <div class="eyebrow">${o.dropOnly?"Who goes":"Drop"}${o.add&&!need?" (optional)":""}</div>
      ${adv&&best?`<div class="rmbest">Best drop: <b>${esc(rmName(best))}</b>. ${(()=>{const a=adv[0];return [a.today>0.5?`${esc(last(f.n))} fits a starting spot today (+${Math.round(a.today)})`:rmToday(a.p).k==="off"?`${esc(last(a.p.n))} doesn't play today`:"",a.per>0?`${esc(last(f.n))} is ${a.per.toFixed(1)} a game better`:`you lose ${(-a.per).toFixed(1)} a game long term`].filter(Boolean).join(", ")})()}.</div>`:adv?`<div class="rmbest keep">Nobody on your roster is a clear drop for ${esc(f.n)}. Everyone is worth more than him over the next couple of weeks.</div>`:""}
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
