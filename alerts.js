/* Alerts: push notifications to your phone through the free ntfy app. After every data refresh, notify.py checks for
   injuries on your team (urgent if he's in today's lineup), lineup problems, free agents clearly better than your
   weakest player, pickups that add points this week, players just dropped, trade offers and league trades.
   This section shows whether alerts are on, the recent alerts, and the one-time setup. */
let NST=null;
async function loadAlerts(){try{const r=await fetch("notify_state.json?t="+Date.now(),{cache:"no-store"});if(r.ok)NST=await r.json()}catch(e){}}
function renderAlerts(){
  const el=$("#secAlerts");if(!el)return;
  if(NST===null){el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Push to your phone</div><h2>Alerts</h2></div></div><div class="simload"><span></span>Loading…</div>`;loadAlerts().then(()=>{NST=NST||{};renderAlerts()});return}
  const on=!!NST.on,log=(NST.log||[]).slice(0,8);
  let topic="";try{topic=localStorage.getItem("grindex-ntfy")||""}catch(e){}
  if(!topic){topic="grindex-"+Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>"abcdefghijkmnpqrstuvwxyz23456789"[b%32]).join("");try{localStorage.setItem("grindex-ntfy",topic)}catch(e){}}
  const kinds=[["🚨","Injuries","Your player is ruled out or questionable. Urgent if he's in today's lineup, with who to swap in."],
    ["📋","Lineup","A starter isn't playing today while someone on your bench is."],
    ["⬆️","Upgrades","A free agent is clearly better than your weakest healthy player."],
    ["📈","Pickups","An add/drop that gains real points this week from extra games."],
    ["🆓","Just dropped","A good player another team just let go."],
    ["🤝","Trades","Offers to you, and any trade that goes through in the league."],
    ["✅","Your moves","Your adds, drops and claims going through. Plus your opponent's adds."]];
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Push to your phone</div><h2>Alerts</h2></div>
      <span class="alstate ${on?"on":""}"><i></i>${on?"On":"Not set up"}</span></div>
    <div class="algrid">
      <div class="alcol">
        ${on?`<div class="allog">${log.length?log.map(a=>`<div class="alrow p${a.prio||3}"><div><b>${esc(a.title)}</b><span>${esc(a.body)}</span></div><small>${esc(agoTxt(a.at))}</small></div>`).join(""):`<p class="mute">Nothing yet. Alerts show up here and on your phone.</p>`}</div>
          <div class="alact"><button class="b" type="button" id="alTest">Send a test alert</button><span class="faint">Checks run after every data refresh, about every 30 minutes.</span></div>`
        :`<ol class="alsteps">
          <li><b>Get the ntfy app</b><span>Free, no account. <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a></span></li>
          <li><b>Subscribe to your private topic</b><span>In ntfy tap +, paste this name. Anyone who knows it can read your alerts, so keep it to yourself.</span>
            <div class="altopic"><code id="alTopic">${esc(topic)}</code><button class="b" type="button" id="alCopy">Copy</button><button class="b" type="button" id="alNew" title="New name">↻</button></div></li>
          <li><b>Give it to GitHub</b><span>Add a repository secret named <code>NTFY_TOPIC</code> with that same name as the value.</span>
            <a class="b" href="https://github.com/garrettyates00-png/garebears-courtside/settings/secrets/actions/new" target="_blank" rel="noopener">Open GitHub secrets ↗</a></li>
          <li><b>Test it</b><span>Your phone should buzz within a minute.</span><button class="b primary" type="button" id="alTest">Send a test alert</button></li>
        </ol>`}
      </div>
      <ul class="alkinds">${kinds.map(([i,t,x])=>`<li><span>${i}</span><div><b>${t}</b><small>${x}</small></div></li>`).join("")}</ul>
    </div>`;
  const c=$("#alCopy");if(c)c.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(topic).then(()=>toast("Copied"),()=>{})};
  const n=$("#alNew");if(n)n.onclick=()=>{try{localStorage.removeItem("grindex-ntfy")}catch(e){}renderAlerts()};
  const t=$("#alTest");if(t)t.onclick=async()=>{const before=(NST.log||[])[0]?.at||"";
    const ok=await dispatch("notify.yml",null,"Sending a test alert",async()=>{await loadAlerts();return ((NST.log||[])[0]||{}).at!==before});
    if(ok)toast("Sent. Check your phone.");else if(ok===false)toast("Still running. If nothing arrives, make sure the NTFY_TOPIC secret is saved.");
    NST=NST||{};NST.on=true;renderAlerts()};
}
