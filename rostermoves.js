/* Moves to make: suggested pickups (already accounting for injuries and your pending claims), each with an
   Execute button, plus every available player with Add. Adding opens a short sheet: pick who to drop (or use an
   open spot, or move an OUT player to IR first), confirm, and roster.yml makes the move on ESPN. */
let RMQ=null;  // request in flight
const rmName=id=>((D.players.find(p=>p.id===+id)||(D.fa||[]).find(f=>f.id===+id)||{}).n)||"";
const rmWhen=f=>f.st==="WAIVERS"?`Waiver claim${f.wclear?`, clears ${f.wclear}`:""}`:"Free agent, added right away";

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
  const tb=$("#fa");if(tb){tb.querySelectorAll("tbody tr").forEach((tr,k)=>{const f=D.fa[k];if(!f||tr.querySelector(".rmadd"))return;
    const td=document.createElement("td");td.className="r";
    td.innerHTML=f.claimed?`<span class="faint" style="font-size:12px">claimed</span>`:`<button class="b rmadd" type="button" data-add="${f.id}">Add</button>`;tr.appendChild(td)});
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
    const opt=p=>{
      return `<button type="button" class="rmopt ${o.drop===p.id?"on":""}" data-d="${p.id}"><span><b>${esc(p.n)}</b>${injTag(p.inj)}<small>${esc(p.tm)} · ${p.slot} · ${p.pa.toFixed(1)}/g${(R.claim_drop||[]).includes(p.id)?" · in a pending drop":""}</small></span><span class="faint">${p.wk?Math.round(p.wk)+" wk":""}</span></button>`};
    const irOpts=(R.ir_cands||[]).map(id=>D.players.find(p=>p.id===id)).filter(Boolean);
    m.innerHTML=`<div class="box rmbox" role="dialog" aria-label="Roster move">
      <h2 style="margin:0">${o.dropOnly?"Drop a player":`Add ${esc(f?f.n:rmName(o.add))}`}</h2>
      ${f?`<p class="mute" style="margin:0;font-size:14px">${esc(f.tm)} · ${esc(f.pos)} · ${f.pa.toFixed(1)}/g · ${f.g} games this week${f.inj?" · "+esc(injWord(f.inj)):""}. ${esc(rmWhen(f))}.</p>`:""}
      ${o.add?`<div class="rmstate">${R.room>0?`You have <b>${R.room}</b> open spot${R.room>1?"s":""}, so a drop is optional.`:`Your roster is full${(R.claim_add||[]).length?" once your pending claims go through":""}. Pick someone to drop${irOpts.length&&R.ir_free?", or move an OUT player to IR":""}.`}</div>`:""}
      ${o.add&&irOpts.length&&R.ir_free?`<div class="eyebrow">Move to IR instead</div><div class="rmopts">${irOpts.map(p=>`<button type="button" class="rmopt ${o.ir===p.id?"on":""}" data-ir="${p.id}"><span><b>${esc(p.n)}</b>${injTag(p.inj)}<small>${esc(p.tm)} · ${p.pa.toFixed(1)}/g · keeps him, frees a spot</small></span></button>`).join("")}</div>`:""}
      <div class="eyebrow">${o.dropOnly?"Who goes":"Drop"}${o.add&&!need?" (optional)":""}</div>
      <div class="rmopts rmscroll">${mine.filter(p=>p.slot!=="IR"||o.dropOnly).map(opt).join("")}</div>
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
