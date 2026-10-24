/* My bets: a personal bet log on the Season tab. Saved in this browser (localStorage), graded automatically
   from ESPN final scores for spreads, moneylines and totals; props are marked won/lost by hand. */
const BK="grindex-bets";
let BETS=[];try{BETS=JSON.parse(localStorage.getItem(BK)||"[]")}catch(e){BETS=[]}
const saveBets=()=>{try{localStorage.setItem(BK,JSON.stringify(BETS))}catch(e){}};
let betForm=false,betTeam=null,betSched={},betCfg=null;
const ctYMD=iso=>{const d=new Date(new Date(iso).toLocaleString("en-US",{timeZone:"America/Chicago"}));return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`};
async function betLoadTeam(a){if(betSched[a])return betSched[a];
  try{const j=await (await fetch(`arena/${a}.json?t=${Date.now()}`,{cache:"no-store"})).json();betSched[a]={abbr:j.team.abbr,name:j.team.name,games:j.schedule}}catch(e){betSched[a]={abbr:a.toUpperCase(),games:[]}}
  return betSched[a]}
/* one team's games up to today (no future days), newest first, shaped like scoreboard games */
function betGames(a){const S=betSched[a];if(!S)return [];const today=ctYMD(new Date().toISOString());
  return S.games.filter(g=>ctYMD(g.date)<=today).map(g=>{const us={abbr:S.abbr,score:g.us},them={abbr:g.opp,score:g.them};
    return {id:g.id,date:ctYMD(g.date),iso:g.date,stype:g.stype,state:g.final?"post":g.state||"pre",home:g.home?us:them,away:g.home?them:us,res:g.res,opp:g.opp,isHome:g.home}}).reverse()}
const profitOf=b=>b.result==="W"?(b.odds>0?b.stake*b.odds/100:b.stake*100/-b.odds):b.result==="L"?-b.stake:0;
const money=v=>(v<0?"-$":"$")+Math.abs(v).toFixed(2);
function grade(b,g){
  if(!g||g.state!=="post"||g.home.score==null)return null;
  const h=+g.home.score,a=+g.away.score,us=b.side==="home"?h:a,them=b.side==="home"?a:h;
  if(b.type==="ml")return us>them?"W":"L";
  if(b.type==="spread"){const m=us+b.line-them;return m>0?"W":m<0?"L":"P"}
  if(b.type==="total"){const t=h+a;return t===b.line?"P":(b.side==="over")===(t>b.line)?"W":"L"}
  return null;
}
async function gradeBets(){
  const pending=BETS.filter(b=>!b.result&&b.type!=="prop");if(!pending.length)return;
  const dates=[...new Set(pending.map(b=>b.date))];let changed=false;
  for(const d of dates){
    let games=[];
    try{const j=await (await fetch(`${SBASE}/scoreboard?dates=${d}&limit=30`,{cache:"no-store"})).json();games=(j.events||[]).map(normGame)}
    catch(e){try{const j=await (await fetch("arena/scoreboard.json?t="+Date.now(),{cache:"no-store"})).json();games=((j.days||{})[d]||{}).games||[]}catch(e2){}}
    for(const b of pending.filter(x=>x.date===d)){let g=games.find(x=>x.id===b.gid);
      if(!g||g.state!=="post"){await betLoadTeam(b.away.toLowerCase());g=betGames(b.away.toLowerCase()).find(x=>x.id===b.gid)||g}
      const r=grade(b,g);if(r){b.result=r;b.final=`${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}`;changed=true}}
  }
  if(changed){saveBets();sBets()}
}
function betLabel(b){
  const team=b.side==="home"?b.home:b.away;
  if(b.type==="spread")return `${team} ${b.line>0?"+":""}${b.line}`;
  if(b.type==="ml")return `${team} moneyline`;
  if(b.type==="total")return `${b.side==="over"?"Over":"Under"} ${b.line} · ${b.away} @ ${b.home}`;
  return b.desc||"Prop";
}
function sBets(){
  const el=$("#sBets");if(!el)return;
  const done=BETS.filter(b=>b.result),w=done.filter(b=>b.result==="W").length,l=done.filter(b=>b.result==="L").length,p=done.filter(b=>b.result==="P").length;
  const staked=done.filter(b=>b.result!=="P").reduce((s,b)=>s+b.stake,0),pl=done.reduce((s,b)=>s+profitOf(b),0),open=BETS.filter(b=>!b.result);
  if(betForm&&!betCfg){fetch("arena/config.json?t="+Date.now(),{cache:"no-store"}).then(r=>r.json()).then(c=>{betCfg=c;sBets()}).catch(()=>{betCfg={teams:[],names:{}}});}
  if(betForm&&betTeam==null)betTeam=(typeof getFav==="function"?getFav():"mem");
  if(betForm&&!betSched[betTeam]){betLoadTeam(betTeam).then(()=>sBets())}
  const games=betForm?betGames(betTeam):[];
  const md=y=>`${+y.slice(4,6)}/${+y.slice(6)}`,today=ctYMD(new Date().toISOString());
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Saved on this device</div><h2>My bets</h2></div><button class="b primary" type="button" id="betAdd">${betForm?"Close":"+ Log a bet"}</button></div>
    <div class="stot"><span class="pill">${w}-${l}${p?"-"+p:""}</span><span class="pill ${pl>=0?"up":"down"}">${pl>=0?"+":""}${money(pl)}</span><span class="pill">ROI ${staked?((pl/staked)*100).toFixed(1)+"%":"–"}</span>${open.length?`<span class="pill">${open.length} open · ${money(open.reduce((s,b)=>s+b.stake,0))} at risk</span>`:""}</div>
    ${betForm?`<form class="betf" id="betF">
      <label>Team<select name="team">${((betCfg&&betCfg.teams)||[betTeam]).map(a=>[a,(betCfg&&betCfg.names&&betCfg.names[a])||a.toUpperCase()]).sort((x,y)=>x[1].localeCompare(y[1])).map(([a,n])=>`<option value="${a}" ${a===betTeam?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="gm">Game<select name="gid" required>${!betSched[betTeam]?`<option value="">Loading games…</option>`:games.length?games.map(g=>`<option value="${g.id}">${g.date===today?"Today":md(g.date)} · ${g.isHome?"vs":"@"} ${esc(g.opp)}${g.state==="post"&&g.home.score!=null?` · ${g.res||""} ${g.isHome?g.home.score:g.away.score}-${g.isHome?g.away.score:g.home.score}`:g.state==="in"?" · live":""}${g.stype==="Preseason"?" · pre":""}</option>`).join(""):`<option value="">No games yet</option>`}</select></label>
      <label>Bet<select name="type"><option value="spread">Spread</option><option value="ml">Moneyline</option><option value="total">Total</option><option value="prop">Prop / other</option></select></label>
      <label>Pick<select name="side"></select></label>
      <label class="ln">Line<input name="line" type="number" step="0.5" placeholder="-1.5"></label>
      <label class="ds" hidden>What<input name="desc" placeholder="Brunson over 27.5 pts"></label>
      <label>Odds<input name="odds" type="number" step="1" value="-110"></label>
      <label>Stake ($)<input name="stake" type="number" step="0.01" min="0" required placeholder="5"></label>
      <button class="b primary" type="submit">Save bet</button>
      <p class="faint" style="grid-column:1/-1;margin:0;font-size:12.5px">Pick a team, then any of its games through today. Spreads, moneylines and totals grade themselves when the game ends.</p>
    </form>`:""}
    ${BETS.length?`<div class="tscroll"><table class="tbl"><thead><tr><th>Bet</th><th>Date</th><th>Odds</th><th>Stake</th><th>Result</th><th>P/L</th><th></th></tr></thead><tbody>
      ${BETS.slice().sort((a,b)=>{const k=x=>x.date+(x.gt||"");return k(b).localeCompare(k(a))||b.ts-a.ts}).map(b=>`<tr><td><span class="nm">${esc(betLabel(b))}<small>${esc(b.final||(b.type==="total"||b.type==="prop"?"":`${b.away} @ ${b.home}`))}</small></span></td>
        <td>${b.date.slice(4,6)}/${b.date.slice(6)}</td><td>${b.odds>0?"+":""}${b.odds}</td><td>${money(b.stake)}</td>
        <td>${b.result?`<span class="${b.result==="W"?"up":b.result==="L"?"down":""}">${{W:"Won",L:"Lost",P:"Push"}[b.result]}</span>`:b.type==="prop"?`<button class="b" data-mark="W" data-id="${b.ts}" style="padding:3px 10px">Won</button> <button class="b" data-mark="L" data-id="${b.ts}" style="padding:3px 10px">Lost</button>`:'<span class="faint">open</span>'}</td>
        <td class="${profitOf(b)>0?"up":profitOf(b)<0?"down":""}">${b.result?(profitOf(b)>=0?"+":"")+money(profitOf(b)):"–"}</td>
        <td><button class="x" data-del="${b.ts}" aria-label="Delete bet" title="Delete">✕</button></td></tr>`).join("")}</tbody></table></div>`:`<p class="mute" style="margin:0">No bets logged yet.</p>`}`;
  $("#betAdd").onclick=()=>{betForm=!betForm;sBets()};
  const f=$("#betF");
  if(f){
    const sync=()=>{const g=games.find(x=>x.id===f.gid.value),t=f.type.value;
      f.side.innerHTML=t==="total"?'<option value="over">Over</option><option value="under">Under</option>':g?`<option value="away">${esc(g.away.short||g.away.abbr)}</option><option value="home">${esc(g.home.short||g.home.abbr)}</option>`:"";
      f.querySelector(".ln").hidden=t==="ml"||t==="prop";f.querySelector(".ds").hidden=t!=="prop";f.side.parentElement.hidden=t==="prop"};
    f.gid.onchange=sync;f.type.onchange=sync;sync();
    f.team.onchange=()=>{betTeam=f.team.value;sBets()};
    f.onsubmit=e=>{e.preventDefault();const g=games.find(x=>x.id===f.gid.value);if(!g)return;const t=f.type.value;
      const b={ts:Date.now(),gid:g.id,date:g.date,gt:g.iso,away:g.away.abbr,home:g.home.abbr,type:t,side:t==="prop"?"":f.side.value,line:+f.line.value||0,desc:f.desc.value.trim(),odds:+f.odds.value||-110,stake:+f.stake.value||0,result:null};
      if((t==="spread"||t==="total")&&!f.line.value){f.line.focus();return}
      b.result=grade(b,g);if(b.result)b.final=`${g.away.abbr} ${g.away.score}, ${g.home.abbr} ${g.home.score}`;
      BETS.push(b);saveBets();betForm=false;sBets();toast(b.result?`Logged and graded: ${{W:"won",L:"lost",P:"push"}[b.result]}.`:"Bet logged. It grades itself when the game ends.")};
  }
  el.querySelectorAll("[data-del]").forEach(x=>x.onclick=()=>{if(!confirmDel(x))return;BETS=BETS.filter(b=>b.ts!=+x.dataset.del);saveBets();sBets()});
  el.querySelectorAll("[data-mark]").forEach(x=>x.onclick=()=>{const b=BETS.find(b=>b.ts==+x.dataset.id);if(b){b.result=x.dataset.mark;saveBets();sBets()}});
}
/* two-tap delete instead of a browser confirm dialog */
function confirmDel(x){if(x.dataset.arm)return true;x.dataset.arm="1";x.textContent="Delete?";x.style.width="auto";setTimeout(()=>{if(x.isConnected){delete x.dataset.arm;x.textContent="✕"}},3000);return false}
const _rs=renderSeason;renderSeason=function(){_rs();if(!betForm)sBets();gradeBets()};
