/* Insights: league leaderboards. Injuries (points lost to missed games, and how the power rankings would look
   with everyone healthy), moves (most active, most and least points gained), and lineups (bench points,
   efficiency, points left on the bench). Each card names the leader and ranks every team; your team is marked. */
let INS_OPEN={};
function insFull(p){return p.av>0?(p.v??p.pa)/p.av:p.pa}
function insHealthyPower(){
  // power with every injured player healthy: same formula as the rankings (core + a quarter of the bench),
  // without the injury penalty
  const n=D.slots.length,out={};
  for(const t of Object.keys(D.teams)){const r=D.players.filter(p=>String(p.t)===t).map(insFull).sort((a,b)=>b-a);
    out[t]=r.slice(0,n).reduce((a,b)=>a+b,0)+.25*r.slice(n).reduce((a,b)=>a+b,0)}
  return out;
}
function renderInsights(){
  const el=$("#secInsights");if(!el||!D||!D.mgr)return;
  const T=D.teams,M=D.mgr.teams||{},ids=Object.keys(T),me=String(D.me);
  const nm=t=>esc(T[t].name),mine=t=>t===me;
  const num=(v,d=0)=>(v==null||isNaN(v))?"–":Number(v).toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:d});
  // power sway
  const hp=insHealthyPower(),curRank=ids.slice().sort((a,b)=>T[b].power-T[a].power),hRank=ids.slice().sort((a,b)=>hp[b]-hp[a]);
  const sway=Object.fromEntries(ids.map(t=>[t,(hRank.indexOf(t)+1)-(curRank.indexOf(t)+1)]));
  const moveCount=t=>(M[t].adds||0)+(M[t].drops||0)+(M[t].trades||0);
  const eff=t=>M[t].opt?M[t].act/M[t].opt:null;
  const mv=(D.mgr.moves||[]).filter(m=>m.net!=null);
  const best=mv.slice().sort((a,b)=>b.net-a.net)[0],worst=mv.slice().sort((a,b)=>a.net-b.net)[0];
  const mvTxt=m=>m?`${m.add.map(a=>"+"+esc(a.n)).concat(m.drop.map(d=>"−"+esc(d.n))).join(", ")}`:"";
  const cards=[
    {k:"inj",eye:"Injuries",title:"Points lost to missed games",val:t=>M[t].inj_lost||0,fmt:v=>num(v),hi:true,
      sub:t=>`${M[t].inj_games||0} missed games${(M[t].inj_who||[]).length?": "+M[t].inj_who.slice(0,2).map(w=>`${esc(last(w[0]))} ${w[1]}`).join(", "):""}`,
      lead:t=>`${nm(t)} have lost about <b>${num(M[t].inj_lost)}</b> points to players sitting out${(M[t].inj_who||[])[0]?`, most of it ${esc(M[t].inj_who[0][0])} (${M[t].inj_who[0][1]} games)`:""}.`,
      note:"A rostered player whose NBA team played but who scored nothing (injury, illness or rest), valued at his season average."},
    {k:"injwk",eye:"Injuries",title:"Hurt the most this week",val:t=>((D.injury||{})[t]||{}).week||0,fmt:v=>num(v),hi:true,
      sub:t=>(((D.injury||{})[t]||{}).who||[]).slice(0,2).map(w=>`${esc(last(w[0]))} ${injWord(w[1]).toLowerCase()}`).join(", ")||"healthy",
      lead:t=>`${nm(t)} lose about <b>${num(((D.injury||{})[t]||{}).week)}</b> projected points this week to injuries.`},
    {k:"sway",eye:"Power rankings",title:"Rank with everyone healthy",val:t=>-sway[t],fmt:v=>v>0?`↑${v}`:v<0?`↓${-v}`:"–",hi:true,signed:true,
      sub:t=>`#${curRank.indexOf(t)+1} now · #${hRank.indexOf(t)+1} healthy`,
      lead:t=>sway[t]<0?`Healthy, ${nm(t)} would jump from <b>#${curRank.indexOf(t)+1}</b> to <b>#${hRank.indexOf(t)+1}</b> in the power rankings. Injuries are hiding the most.`:"No team's ranking is being moved by injuries right now.",
      note:"Power ranking with every injured player at full strength, compared with the rankings now."},
    {k:"active",eye:"Moves",title:"Most active",val:t=>moveCount(t),fmt:v=>num(v),hi:true,
      sub:t=>`${M[t].adds||0} adds · ${M[t].drops||0} drops${M[t].trades?` · ${M[t].trades} trades`:""}`,
      lead:t=>`${nm(t)} have made the most moves: <b>${moveCount(t)}</b>.`},
    {k:"gain",eye:"Moves",title:"Points gained from moves",val:t=>M[t].net||0,fmt:v=>(v>0?"+":v<0?"−":"")+num(Math.abs(v)),hi:true,signed:true,
      sub:t=>`${moveCount(t)} moves`,
      lead:t=>`${nm(t)} have gained the most from their moves: <b>+${num(M[t].net)}</b>.${best?` Best single move: ${mvTxt(best)} by ${nm(String(best.t))} (+${num(best.net)}).`:""}`,
      note:"What added players scored for the team since each move, minus what the dropped players scored anywhere since."},
    {k:"loss",eye:"Moves",title:"Points lost from moves",val:t=>-(M[t].net||0),fmt:v=>(v>0?"−":v<0?"+":"")+num(Math.abs(v)),hi:true,signed:true,neg:true,
      sub:t=>`${moveCount(t)} moves`,
      lead:t=>(M[t].net||0)<0?`${nm(t)} have lost the most to their moves: <b>−${num(-M[t].net)}</b>.${worst&&worst.net<0?` Worst single move: ${mvTxt(worst)} by ${nm(String(worst.t))} (−${num(-worst.net)}).`:""}`:"Nobody's moves have cost them points yet."},
    {k:"bench",eye:"Lineups",title:"Most points scored on the bench",val:t=>M[t].bench_pts||0,fmt:v=>num(v),hi:true,neg:true,
      sub:t=>`${num(M[t].lost)} of it could have counted`,
      lead:t=>`${nm(t)} have had <b>${num(M[t].bench_pts)}</b> points scored on their bench.`,
      note:"Everything bench players scored. Some of it couldn't have counted anyway when the starting slots were full of players who also played."},
    {k:"effg",eye:"Lineups",title:"Most efficient lineups",val:t=>eff(t),fmt:v=>v==null?"–":(v*100).toFixed(1)+"%",hi:true,
      sub:t=>`${num(M[t].act)} of ${num(M[t].opt)} possible`,
      lead:t=>`${nm(t)} have set the best lineups: <b>${(eff(t)*100).toFixed(1)}%</b> of the best possible points.`,
      note:"Points scored divided by what the best possible lineup would have scored each day."},
    {k:"lost",eye:"Lineups",title:"Points left on the bench",val:t=>M[t].lost||0,fmt:v=>num(v),hi:true,neg:true,
      sub:t=>`${num(M[t].lost_wk)} this week${M[t].dead?` · ${M[t].dead} zero starts`:""}`,
      lead:t=>`${nm(t)} have left <b>${num(M[t].lost)}</b> points on the bench with lineups that weren't the best possible.`,
      note:"The gap between each day's best possible lineup and the one that was set. Zero starts: a starter who didn't play while a bench player did."},
  ];
  const card=c=>{
    const rows=ids.filter(t=>M[t]||c.k==="injwk"||c.k==="sway").map(t=>({t,v:c.val(t)})).filter(r=>r.v!=null).sort((a,b)=>b.v-a.v);
    const top=rows[0],max=Math.max(...rows.map(r=>Math.abs(r.v)),1),open=INS_OPEN[c.k],show=open?rows:rows.slice(0,5);
    const myI=rows.findIndex(r=>mine(r.t));
    return `<article class="inscard"><div class="eyebrow">${c.eye}</div><h3>${c.title}</h3>
      ${top?`<p class="inslead">${c.lead(top.t)}</p>`:""}
      <ol class="insl">${show.map((r,i)=>`<li class="${mine(r.t)?"me":""}"><span class="insr">${i+1}</span><span class="insn"><b>${nm(r.t)}</b><small>${c.sub(r.t)}</small></span>
        <span class="insb"><i class="${c.neg?"neg":""} ${c.signed&&r.v<0?"neg":""}" style="width:${Math.max(2,Math.abs(r.v)/max*100)}%"></i></span><span class="insv num">${c.fmt(r.v)}</span></li>`).join("")}</ol>
      ${!open&&myI>=5?`<p class="insme">You: <b>#${myI+1}</b> · ${c.fmt(rows[myI].v)}</p>`:""}
      <div class="insft">${rows.length>5?`<button class="b insmore" type="button" data-k="${c.k}">${open?"Top 5":"All teams"}</button>`:""}${c.note?`<span class="faint">${c.note}</span>`:""}</div></article>`};
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">League insights · season so far</div><h2>Insights</h2></div></div>
    <div class="insgrid">${cards.map(card).join("")}</div>`;
  el.querySelectorAll(".insmore").forEach(b=>b.onclick=()=>{INS_OPEN[b.dataset.k]=!INS_OPEN[b.dataset.k];renderInsights()});
}
