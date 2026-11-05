/* Lineup editor (Lineup by day). Starts from the suggested lineup for the chosen day. Every row shows the
   player, his projection that day, injury status and his projection for the rest of the week. Drag a row by its
   handle (or tap one row, then tap where it should go) to swap slots, send a player to the bench or to IR.
   Execute runs lineup.yml with the exact lineup; setlineup.py saves it to ESPN for that day. */
let LU=null,luSel=null,luDrag=null;
const LU_IR=2;
const luElig=(p,slot)=>{if(slot==="BE")return true;if(slot==="IR")return /OUT|RESERVE|SUSP/.test(p.inj||"");
  const e=p.el||[];if(slot==="UTIL")return e.some(x=>["PG","SG","SF","PF","C"].includes(x));if(slot==="G")return e.includes("PG")||e.includes("SG");if(slot==="F")return e.includes("SF")||e.includes("PF");return e.includes(slot)};
const luP=id=>D.players.find(p=>p.id===+id);

function luInit(){
  const d=D.teams[D.me].daily[day];if(!d)return null;
  const mine=P(D.me),byName=Object.fromEntries(mine.map(p=>[p.n,p])),pp=d.pp||{};
  const plays=id=>pp[id]!=null;
  // start from the lineup ESPN has now and change only what the suggestion needs:
  // players with a game who should start go in, players with a game who shouldn't go to the bench,
  // and starters with no game that day stay where they are unless their slot is needed
  const want=d.start.map(([,n])=>byName[n]).filter(Boolean),wantS=new Set(want.map(p=>p.id));
  const starters=D.slots.map(()=>null);
  for(const p of mine){if(p.slot==="IR"||p.slot==="BE")continue;if(!wantS.has(p.id)&&plays(p.id))continue;
    const k=D.slots.findIndex((s,i)=>s===p.slot&&starters[i]==null);if(k>=0)starters[k]=p.id}
  const tryPlace=(p,seen,evict)=>{for(let k=0;k<D.slots.length;k++){if(seen.has(k)||!luElig(p,D.slots[k]))continue;seen.add(k);
    const cur=starters[k];
    if(cur==null||(wantS.has(cur)&&tryPlace(luP(cur),seen,evict))||(evict&&!wantS.has(cur))){starters[k]=p.id;return true}}return false};
  for(const p of want){if(starters.includes(p.id))continue;if(!tryPlace(p,new Set(),false))tryPlace(p,new Set(),true)}
  const ir=mine.filter(p=>p.slot==="IR").map(p=>p.id);
  // starting slots nobody with a game needs: fill with your best healthy players who don't play that day
  // (0 points either way, but the starting lineup keeps your best players instead of empty slots)
  const idle=mine.filter(p=>!starters.includes(p.id)&&!ir.includes(p.id)&&!plays(p.id)&&!/OUT|RESERVE|SUSP/.test(p.inj||"")).sort((a,b)=>b.pa-a.pa);
  const order=D.slots.map((s,i)=>i).sort((a,b)=>({UTIL:3,G:2,F:2}[D.slots[a]]||1)-({UTIL:3,G:2,F:2}[D.slots[b]]||1));
  for(const k of order){if(starters[k]!=null)continue;const j=idle.findIndex(p=>luElig(p,D.slots[k]));if(j>=0){starters[k]=idle[j].id;idle.splice(j,1)}}
  const bench=mine.filter(p=>!starters.includes(p.id)&&!ir.includes(p.id)).map(p=>p.id);
  return {iso:d.iso,day:d.day,pp,locked:new Set((d.locked||[]).map(Number)),starters,bench,ir,dirty:false,sug:d.pts,
    nPlay:mine.filter(p=>plays(p.id)&&p.slot!=="IR").length,nStart:want.length};
}
const luPts=L=>L.starters.reduce((s,id)=>s+(id?(L.pp[id]||0):0),0);
function luWhere(L,id){let i=L.starters.indexOf(id);if(i>=0)return {z:"S",i};if(L.bench.includes(id))return {z:"BE"};if(L.ir.includes(id))return {z:"IR"};return null}
function luSlotOf(L,id){const w=luWhere(L,id);return !w?null:w.z==="S"?D.slots[w.i]:w.z}

/* move player `id` to target: {z:"S",i} a starting slot (swap with whoever is there), {z:"BE"} or {z:"IR"} */
function luMove(id,tgt){
  const L=LU,p=luP(id),from=luWhere(L,id);if(!p||!from)return "";
  if(L.locked.has(id))return `${p.n}'s game has started, so he's locked.`;
  if(tgt.z==="S"){
    const slot=D.slots[tgt.i],other=L.starters[tgt.i];
    if(other===id)return "";
    if(!luElig(p,slot))return `${p.n} can't play ${slot}.`;
    if(other&&L.locked.has(other))return `${luP(other).n}'s game has started, so that slot is locked.`;
    if(other){const o=luP(other);
      if(from.z==="S"){if(!luElig(o,D.slots[from.i]))return `${o.n} can't play ${D.slots[from.i]}, so they can't swap.`;L.starters[from.i]=other}
      else if(from.z==="IR"){if(!luElig(o,"IR"))return `${o.n} isn't injured, so he can't go to IR.`;L.ir.push(other)}
      else L.bench.push(other)}
    else if(from.z==="S")L.starters[from.i]=null;
    if(from.z==="BE")L.bench=L.bench.filter(x=>x!==id);if(from.z==="IR")L.ir=L.ir.filter(x=>x!==id);
    L.starters[tgt.i]=id;
  }else if(tgt.z==="BE"){
    if(from.z==="BE")return "";
    if(from.z==="S")L.starters[from.i]=null;else L.ir=L.ir.filter(x=>x!==id);
    L.bench.push(id);
  }else if(tgt.z==="IR"){
    if(from.z==="IR")return "";
    if(!luElig(p,"IR"))return `Only players listed OUT can go on IR. ${p.n} is ${p.inj?injWord(p.inj):"healthy"}.`;
    if(L.ir.length>=LU_IR)return `Both IR spots are full. Move someone off IR first.`;
    if(from.z==="S")L.starters[from.i]=null;else L.bench=L.bench.filter(x=>x!==id);
    L.ir.push(id);
  }
  L.dirty=true;return "";
}

function renderLU(){
  const el=$("#slots");if(!el||!D)return;
  const d=D.teams[D.me].daily[day];if(!d){el.innerHTML="";return}
  if(!LU||LU.iso!==d.iso||(!LU.dirty))LU=luInit();
  const L=LU,T=D.teams[D.me],pts=luPts(L),wk=T.proj-L.sug+pts;
  const row=(id,label,tgt)=>{
    const p=id&&luP(id),lk=p&&L.locked.has(id),sel=luSel===id;
    const tg=JSON.stringify(tgt).replace(/"/g,"&quot;");
    if(!p)return `<div class="lurow empty" data-tgt="${tg}"><span class="luh"></span><span class="lus">${label}</span><span class="lun faint">Open</span><span class="lud"></span><span class="luw"></span></div>`;
    const pp=L.pp[id],cur=p.slot,now=label==="IR"?"IR":label==="BE"?"BE":label,chg=cur!==now&&!(cur==="BE"&&now==="BE");
    return `<div class="lurow ${sel?"sel":""} ${lk?"lk":""} ${chg?"chg":""}" data-id="${id}" data-tgt="${tg}" tabindex="0" aria-label="${esc(p.n)}, ${label}">
      <span class="luh" aria-hidden="true">${lk?"🔒":"⋮⋮"}</span><span class="lus">${label}</span>
      <span class="lun"><span class="lnl"><b>${esc(p.n)}</b>${injTag(p.inj)}</span><small>${esc(p.tm)} · ${p.el.join("/")}${chg?` · was ${esc(cur)}`:""}${lk?" · game started":""}</small></span>
      <span class="lud ${pp?"":"faint"}" ${pp?"":'title="No game this day"'}>${pp?r1(pp):"–"}</span><span class="luw">${p.wk?Math.round(p.wk):"–"}</span></div>`};
  const changes=luChanges();
  el.className="luwrap";
  const noGame=L.starters.filter(id=>id&&!L.pp[id]).length,openS=L.starters.filter(x=>!x).length;
  const dShort=d.day.split(" ")[0],dd=pts-L.sug,wd=wk-T.proj;
  const chip=(v,txt)=>Math.abs(v)>.5?`<span class="luchip ${v>0?"up":"down"}">${v>0?"+":"−"}${Math.round(Math.abs(v))} ${txt}</span>`:"";
  el.innerHTML=`<div class="lustats">
      <div class="lustat"><span class="lul">${esc(d.day)}</span><b class="num">${Math.round(pts)}</b><span class="lusub">${chip(dd,"vs best")||'<span class="luchip ok">Best lineup</span>'}</span></div>
      <div class="lustat"><span class="lul">Week projection</span><b class="num">${Math.round(wk)}</b><span class="lusub">${chip(wd,"from edits")||`<span class="faint">${L.nPlay} playing ${dShort}</span>`}</span></div>
    </div>
    <p class="luexp">${L.nPlay} of your players have a game ${dShort}${L.nStart>=L.nPlay?", and all of them start":`; the best ${L.nStart} start`}.${noGame?` The other ${noGame>1?noGame+" starting spots go to your best players":"starting spot goes to your best player"} without a game (0 points either way).`:""} Highlighted rows are changes from your ESPN lineup.</p>
    <div class="lucols"><span></span><span>Slot</span><span>Player</span><span>${esc(d.day.split(" ")[0])}</span><span>Week</span></div>
    <div class="luzone">${D.slots.map((s,i)=>row(L.starters[i],s,{z:"S",i})).join("")}</div>
    <div class="luz" data-tgt="${JSON.stringify({z:"BE"}).replace(/"/g,"&quot;")}"><div class="eyebrow">Bench · ${L.bench.length} · ${L.bench.filter(id=>L.pp[id]).length} with a game</div>${L.bench.map(id=>row(id,"BE",{z:"BE"})).join("")||`<div class="faint lue">Empty</div>`}</div>
    <div class="luz" data-tgt="${JSON.stringify({z:"IR"}).replace(/"/g,"&quot;")}"><div class="eyebrow">IR · ${L.ir.length}/${LU_IR} · OUT players only</div>${L.ir.map(id=>row(id,"IR",{z:"IR"})).join("")||`<div class="faint lue">Empty</div>`}</div>
    <div class="luact">${changes.length?`<span>${changes.length} change${changes.length>1?"s":""} from your ESPN lineup</span>`:`<span class="faint">Matches your ESPN lineup</span>`}
      <button class="b" type="button" id="luReset" ${L.dirty?"":"disabled"}>Reset to suggested</button>
      <button class="b primary" type="button" id="luGo" ${changes.length?"":"disabled"}>Execute in ESPN</button></div>
    <p class="faint" style="font-size:12.5px;margin:6px 0 0">Drag a player by ⋮⋮, or tap a player and then tap where he should go. ${d.iso===TODAY()?"Players whose game has started are locked.":"ESPN keeps this lineup for later days until it's changed again."}</p>`;
  luWire(el);
}
/* players whose slot differs from what ESPN has now */
function luChanges(){const L=LU;if(!L)return [];const out=[];
  for(const p of P(D.me)){const s=luSlotOf(L,p.id);if(s&&s!==p.slot)out.push({id:p.id,n:p.n,from:p.slot,to:s})}return out}

function luWire(el){
  const hit=(x,y)=>{const e=document.elementFromPoint(x,y);return e&&(e.closest(".lurow")||e.closest(".luz"))};
  const tgtOf=n=>n&&JSON.parse(n.dataset.tgt);
  const drop=(id,node)=>{if(!node)return;const t=tgtOf(node);const msg=luMove(id,t);luSel=null;if(msg)toast(msg);renderLU()};
  el.querySelectorAll(".lurow").forEach(r=>{
    r.onclick=e=>{const id=r.dataset.id?+r.dataset.id:null;
      if(luSel!=null){if(id===luSel){luSel=null;renderLU();return}drop(luSel,r);return}
      if(id&&!LU.locked.has(id)){luSel=id;renderLU()}};
    r.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();r.click()}};
    const h=r.querySelector(".luh");if(!h||!r.dataset.id||LU.locked.has(+r.dataset.id))return;
    h.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const id=+r.dataset.id;const g=r.cloneNode(true);g.classList.add("lughost");g.style.width=r.offsetWidth+"px";document.body.appendChild(g);
      const oy=e.clientY-r.getBoundingClientRect().top;let over=null;r.classList.add("dragging");
      const mv=ev=>{g.style.transform=`translate(${r.getBoundingClientRect().left}px,${ev.clientY-oy}px)`;const n=hit(ev.clientX,ev.clientY);if(n!==over){over&&over.classList.remove("over");over=n&&n!==r?n:null;over&&over.classList.add("over")}};
      const up=ev=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);removeEventListener("pointercancel",up);g.remove();r.classList.remove("dragging");over&&over.classList.remove("over");if(ev.type==="pointerup"&&over)drop(id,over)};
      mv(e);addEventListener("pointermove",mv);addEventListener("pointerup",up);addEventListener("pointercancel",up)}});
  el.querySelectorAll(".luz").forEach(z=>z.addEventListener("click",e=>{if(e.target.closest(".lurow"))return;if(luSel!=null)drop(luSel,z)}));
  $("#luReset").onclick=()=>{LU=null;luSel=null;renderLU()};
  $("#luGo").onclick=()=>{const c=luChanges();const box=el.querySelector(".luact");
    box.innerHTML=`<span>Save ${c.length} change${c.length>1?"s":""} to ESPN for ${esc(LU.day)}?</span><button class="b" type="button" id="luNo">Cancel</button><button class="b primary" type="button" id="luYes">Save</button>
      <ul class="notes" style="flex-basis:100%;margin:6px 0 0">${c.map(m=>`<li><b>${esc(m.n)}</b> ${m.from} → ${m.to}</li>`).join("")}</ul>`;
    $("#luNo").onclick=renderLU;$("#luYes").onclick=luExecute};
}
async function luExecute(){
  const L=LU,map={};for(const p of P(D.me))map[p.id]=luSlotOf(L,p.id);
  const before=LOG[0]?LOG[0].at:"";const box=$(".luact");if(box)box.innerHTML='<span class="mute">Saving to ESPN…</span>';
  const ok=await dispatch("lineup.yml",{dry_run:false,lineup:JSON.stringify(map),day:L.iso},"Saving your lineup to ESPN",async()=>{await loadLog();if(LOG[0]&&LOG[0].at!==before){await load(true);return true}return false});
  if(ok){const R=LOG[0];toast(R.status==="saved"?`Saved ${R.moved.length} change${R.moved.length==1?"":"s"} to ESPN`:R.status==="ok"?"ESPN already had that lineup":"ESPN refused: "+(R.error||R.status));if(R.status==="saved"||R.status==="ok"){LU=null;luSel=null}}
  else if(ok===false)toast("Still saving. Check back in a minute.");
  renderLU();renderLineupAct();
}
/* take over the slot grid in Lineup by day */
const _rd=renderDays;renderDays=function(){_rd();renderLU()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&luSel!=null){luSel=null;renderLU()}});
