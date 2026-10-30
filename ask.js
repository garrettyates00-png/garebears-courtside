/* Ask Grindex: type a question, Claude answers it on your Claude plan.
   The page starts ask.yml on GitHub (same saved GitHub token as Force update and summaries); Claude reads the
   league data in the repo, searches the web for injury news, and writes answers/<id>.json, which this polls for.
   Your question list is kept on this device; the answers live in the repo. */
const ASK_K="grindex-asks";
let ASKS=[];try{ASKS=JSON.parse(localStorage.getItem(ASK_K)||"[]")}catch(e){ASKS=[]}
for(const a of ASKS)if(a.pending&&Date.now()-Date.parse(a.at)>20*60000)a.pending=false;  // gave up long ago; the card checks for a late answer
const askSave=()=>{try{localStorage.setItem(ASK_K,JSON.stringify(ASKS.slice(-40)))}catch(e){}};
const ASKA={},ASKERR={};let askPrev=null,askPolling=false;

function askSuggest(){
  const me=D.me,mine=D.players.filter(p=>p.t==me),out=mine.filter(p=>p.inj==="OUT"||p.inj==="INJURY_RESERVE").sort((a,b)=>b.pa-a.pa);
  const s=[];
  for(const p of out.slice(0,2))s.push(`${p.n} is out. Should I drop him, stash him on IR, or ride it out?`);
  s.push("Do I have room to add another player right now? Who should it be?");
  const offer=(D.league_pending||[]).find(c=>/TRADE/.test(c.type||"")&&!c.mine&&c.items.some(i=>i.to==me||i.frm==me));
  if(offer){const get=offer.items.filter(i=>i.to==me).map(i=>i.n),give=offer.items.filter(i=>i.frm==me).map(i=>i.n);s.push(`Should I accept ${get.join(" + ")} for ${give.join(" + ")}?`)}
  s.push("What's my best move this week to beat "+(D.teams[D.opp]||{}).name+"?");
  return s.slice(0,4);
}
async function askLoad(id){if(ASKA[id])return ASKA[id];try{const r=await fetch(`answers/${id}.json?t=${Date.now()}`,{cache:"no-store"});if(r.ok){ASKA[id]=await r.json();return ASKA[id]}}catch(e){}return null}

function renderAsk(){
  const el=$("#secAsk");if(!el||!D)return;
  const keep=$("#askQ")?$("#askQ").value:"";
  const list=ASKS.slice().reverse(),prevQ=askPrev&&ASKS.find(a=>a.id===askPrev);
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Runs on your Claude plan</div><h2>Ask Grindex</h2></div></div>
    <form id="askF" class="askf">
      ${prevQ?`<div class="askprev"><span class="faint">Following up on:</span> ${esc(prevQ.q)} <button type="button" class="x" id="askNoPrev" aria-label="Cancel follow-up">✕</button></div>`:""}
      <textarea id="askQ" rows="3" maxlength="1500" placeholder="e.g. Should I drop Ja Morant since he'll be out for weeks? Do I have room to add someone?"></textarea>
      <div class="askrow"><div class="pchips">${askSuggest().map(q=>`<button type="button" class="pchip" data-sq="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <button class="b primary" type="submit" id="askGo">Ask</button></div>
      <p class="faint" style="margin:0;font-size:12.5px">Claude reads your roster, the free agents, injuries and the schedule, checks the latest injury news, and answers in about 1 to 3 minutes. Answers are saved in the site's GitHub repo, which is public.</p>
    </form>
    <div class="asklist">${list.map(a=>askCard(a)).join("")}</div>`;
  const f=$("#askF"),q=$("#askQ");q.value=keep;
  el.querySelectorAll("[data-sq]").forEach(b=>b.onclick=()=>{q.value=b.dataset.sq;q.focus()});
  f.onsubmit=e=>{e.preventDefault();askSend(q.value.trim())};
  q.onkeydown=e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();askSend(q.value.trim())}};
  const np=$("#askNoPrev");if(np)np.onclick=()=>{askPrev=null;renderAsk()};
  el.querySelectorAll("[data-fu]").forEach(b=>b.onclick=()=>{askPrev=b.dataset.fu;renderAsk();$("#askQ").focus();$("#secAsk").scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"})});
  el.querySelectorAll("[data-adel]").forEach(b=>b.onclick=()=>{if(!confirmDel(b))return;ASKS=ASKS.filter(a=>a.id!==b.dataset.adel);askSave();renderAsk()});
  el.querySelectorAll("[data-retry]").forEach(b=>b.onclick=()=>{const a=ASKS.find(x=>x.id===b.dataset.retry);if(a){ASKS=ASKS.filter(x=>x!==a);askSave();askPrev=a.prev||null;askSend(a.q)}});
  // fetch any answers not loaded yet
  for(const a of ASKS)if(!ASKA[a.id]&&!a.pending)askLoad(a.id).then(r=>{if(r)renderAsk()});
}
function askCard(a){
  const A=ASKA[a.id],err=ASKERR[a.id];
  const head=`<div class="askq"><b>${esc(a.q)}</b><span class="faint">${esc(agoTxt(a.at))}</span></div>`;
  if(err)return `<div class="askcard">${head}<p class="down" style="margin:8px 0 0;font-size:13.5px">${esc(err)}</p><div class="askbtns"><button class="b" type="button" data-retry="${a.id}">Try again</button><button class="x" type="button" data-adel="${a.id}" aria-label="Remove">✕</button></div></div>`;
  if(!A)return `<div class="askcard">${head}<div class="simload" style="margin-top:10px"><span></span>${a.pending?"Claude is working on it…":"Loading answer…"}</div></div>`;
  return `<div class="askcard">${head}
    <p class="askshort">${esc(A.short)}</p>
    ${(A.moves||[]).length?`<ol class="askmoves">${A.moves.map(m=>`<li><b>${esc(m.do)}</b><span class="faint">${esc(m.why||"")}</span></li>`).join("")}</ol>`:""}
    <details class="askmore"><summary>Full answer</summary>${String(A.answer||"").split(/\n\s*\n/).map(p=>`<p>${esc(p)}</p>`).join("")}
      ${(A.sources||[]).length?`<div class="sumsrc">${A.sources.slice(0,6).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join("")}</div>`:""}</details>
    <div class="askbtns"><button class="b" type="button" data-fu="${a.id}">Follow up</button><button class="x" type="button" data-adel="${a.id}" aria-label="Remove">✕</button></div></div>`;
}
async function askSend(q){
  if(!q){$("#askQ").focus();return}
  if(!getTok()){askHelp(q);return}
  const id="q-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,6);
  const a={id,q,at:new Date().toISOString(),prev:askPrev||"",pending:true};ASKS.push(a);askSave();askPrev=null;$("#askQ").value="";renderAsk();
  try{
    const r=await gh(`/actions/workflows/ask.yml/dispatches`,{method:"POST",body:JSON.stringify({ref:"main",inputs:{id,question:q,prev:a.prev}})});
    if([401,403,404].includes(r.status))throw new Error("GitHub didn't accept the saved token. Reconnect it under Force update, then try again.");
    if(!r.ok)throw new Error("GitHub said "+r.status+".");
  }catch(e){a.pending=false;askSave();ASKERR[id]=e.message;renderAsk();return}
  askPoll();
}
async function askPoll(){
  if(askPolling)return;askPolling=true;
  try{for(let i=0;i<60;i++){
    const open=ASKS.filter(a=>a.pending);if(!open.length)break;
    await new Promise(s=>setTimeout(s,8000));
    for(const a of open){const r=await askLoad(a.id);if(r){a.pending=false;askSave();renderAsk();toast("Your answer is ready.")}}
    if(i%3===2){const why=await askFailure(Math.min(...open.map(a=>Date.parse(a.at))));if(why){for(const a of ASKS.filter(x=>x.pending)){a.pending=false;ASKERR[a.id]=why}askSave();renderAsk()}}
  }}finally{askPolling=false}
}
async function askFailure(since){try{
  const runs=await (await gh(`/actions/workflows/ask.yml/runs?per_page=3&created=>=${new Date(since-60000).toISOString()}`)).json();
  const run=(runs.workflow_runs||[]).find(r=>r.conclusion==="failure");if(!run)return null;
  const jobs=await (await gh(`/actions/runs/${run.id}/jobs`)).json();
  const step=((jobs.jobs||[])[0]?.steps||[]).find(s=>s.conclusion==="failure");const n=step?step.name:"";
  if(n==="Check the Claude token"){claudeSetup("missing");return "The Claude token isn't set up yet."}
  if(n.includes("anthropics")||n.includes("claude-code-action"))return "Claude couldn't run. The token may have expired, or you've hit your plan's usage limit for now.";
  if(n==="Check the request")return "That question couldn't be sent (it may be too long).";
  if(n==="Publish")return "Claude ran but didn't write an answer. Try again.";
  return `The run failed on GitHub${n?` at "${n}"`:""}.`}catch(e){return null}}
function askHelp(q){const m=document.createElement("div");m.className="modal";m.innerHTML=`<div class="box" role="dialog" aria-label="Connect GitHub"><h2 style="margin:0">Connect this browser first</h2>
  <p class="mute" style="margin:0;font-size:14px">Asking runs on GitHub, so this browser needs your saved GitHub token (the same one-time setup as <b>Force update</b>). Tap Force update at the top and follow the setup, then ask again.</p>
  <button class="b" type="button" id="askHClose">Close</button></div>`;document.body.appendChild(m);$("#askHClose").onclick=()=>m.remove();m.addEventListener("click",e=>{if(e.target===m)m.remove()})}
/* resume waiting on anything still pending after a reload */
if(ASKS.some(a=>a.pending)&&typeof getTok==="function"&&getTok())setTimeout(askPoll,1500);
