/* Season simulator: plays the rest of the season 10,000 times in a Web Worker.
   Each simulated season draws every player's true level (projection x ~N(1, 0.12)) and random injuries,
   then plays every remaining week of the real league schedule using each NBA team's real games per week,
   capped by lineup slots. Regular season -> seeds -> playoff bracket -> champion.
   What-if mode re-runs with the same random numbers so the difference is the move, not luck. */
const SIM_N=10000;
let SIMR=null,SIMW=null,simBusy=false,sbGive=new Set(),sbGet=new Set(),sbTeam=null,sbRes=null;

const SIM_WORKER=`
self.onmessage=e=>{const {cfg,players,scen,n,seed}=e.data;const out=run(cfg,players,scen,n,seed);self.postMessage(out)};
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function run(cfg,P0,scen,n,seed){
  const R=rng(seed),gauss=()=>{let u=0,v=0;while(!u)u=R();v=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  // apply the scenario: move players between teams (or in/out of free agency)
  const P=P0.map(p=>({...p}));
  if(scen)for(const [id,t] of scen)for(const p of P)if(p.id===id)p.t=t;
  const teams=cfg.teams,TI=Object.fromEntries(teams.map((t,i)=>[t,i])),NT=teams.length;
  const weeks=[];for(let w=cfg.cur+1;w<=cfg.last;w++)weeks.push(w);
  const W=weeks.length,NP=P.length;
  // per player per future week: games
  const G=P.map(p=>weeks.map(w=>((cfg.gpw[p.tm]||{})[w])||0));
  const cap=weeks.map(w=>Math.round(cfg.slots*(cfg.days[w]||7)*.82));
  const res={po:new Float64Array(NT),title:new Float64Array(NT),fin:new Float64Array(NT),wins:new Float64Array(NT),pf:new Float64Array(NT),seed:teams.map(()=>new Float64Array(NT)),one:new Float64Array(NT)};
  const m=new Float64Array(NP),out=new Int32Array(NP),score=new Float64Array(NT*W);
  const byTeam=teams.map(t=>[]);P.forEach((p,i)=>{const ti=TI[p.t];if(ti!=null)byTeam[ti].push(i)});
  for(let s=0;s<n;s++){
    for(let i=0;i<NP;i++){m[i]=Math.max(.45,Math.min(1.6,1+.12*gauss()));out[i]=P[i].out?Math.floor(R()*3):0}
    // each team's players best-first for this season's draw (sorted once per season, not per week)
    const ord=byTeam.map(L=>L.slice().sort((a,b)=>P[b].v*m[b]-P[a].v*m[a]));
    for(let w=0;w<W;w++){
      for(let ti=0;ti<NT;ti++){
        let left=cap[w],mu=0,va=0;
        for(const i of ord[ti]){
          let g=G[i][w];if(!g)continue;
          if(out[i]>0)continue;
          if(R()<.035){out[i]=1+Math.floor(R()*4);g=Math.floor(g*R());if(!g)continue} // new injury mid-week
          if(left<=0)continue;
          const v=P[i].v*m[i],k=g<left?g:left;mu+=v*k;va+=k*.2025*v*v;left-=k;
        }
        score[ti*W+w]=mu*(1+.09*gauss())+Math.sqrt(va)*gauss(); // week-level team shock + game noise
      }
      for(let i=0;i<NP;i++)if(out[i]>0)out[i]--;
    }
    // current week finishes from the live score + what's left
    const win=teams.map((t,ti)=>cfg.rec[ti][0]),pf=teams.map((t,ti)=>cfg.rec[ti][2]);
    const curScore=cfg.curw.map(c=>c?c[0]+c[1]+c[2]*gauss():0);
    for(const [h,a] of cfg.curGames){const sh=curScore[h],sa=curScore[a];pf[h]+=sh;pf[a]+=sa;if(sh>sa)win[h]++;else if(sa>sh)win[a]++;else{win[h]+=.5;win[a]+=.5}}
    for(const [wk,h,a] of cfg.games){const wi=wk-cfg.cur-1;const sh=score[h*W+wi],sa=score[a*W+wi];pf[h]+=sh;pf[a]+=sa;if(sh>sa)win[h]++;else if(sa>sh)win[a]++;else{win[h]+=.5;win[a]+=.5}}
    const order=teams.map((t,i)=>i).sort((x,y)=>win[y]-win[x]||pf[y]-pf[x]);
    order.forEach((ti,k)=>{res.seed[ti][k]++;res.wins[ti]+=win[ti];res.pf[ti]+=pf[ti]});
    const PT=cfg.pteams;if(PT>1){
      const seeds=order.slice(0,PT);seeds.forEach(ti=>res.po[ti]++);res.one[order[0]]++;
      let S=1;while(S<PT)S*=2;
      // fixed bracket with byes for top seeds: slot list in standard order
      let slots=[1];while(slots.length<S){const nx=[];const m2=slots.length*2+1;for(const x of slots){nx.push(x,m2-x)}slots=nx}
      let alive=slots.map(sd=>sd<=PT?seeds[sd-1]:-1);let rw=cfg.reg+1;
      while(alive.length>1){const nxt=[];
        for(let k=0;k<alive.length;k+=2){const a=alive[k],b=alive[k+1];
          if(a<0){nxt.push(b);continue}if(b<0){nxt.push(a);continue}
          let sa=0,sb=0;for(let q=0;q<cfg.plen;q++){const wi=rw+q-cfg.cur-1;if(wi>=0&&wi<W){sa+=score[a*W+wi];sb+=score[b*W+wi]}}
          nxt.push(sa>=sb?a:b)}
        if(nxt.length===1)for(const t of alive)if(t>=0)res.fin[t]++;
        alive=nxt;rw+=cfg.plen}
      res.title[alive[0]]++;
    }
  }
  const f=x=>Array.from(x,v=>v/n);
  return {teams,po:f(res.po),title:f(res.title),fin:f(res.fin),one:f(res.one),wins:f(res.wins),pf:f(res.pf),seed:res.seed.map(f),n};
}`;
function simCfg(){
  const S=D.sim;if(!S||!S.sched)return null;
  const teams=Object.keys(D.teams).map(Number),TI=Object.fromEntries(teams.map((t,i)=>[t,i]));
  const pteams=S.pteams||4,plen=S.plen||1,rounds=S.rounds||Math.ceil(Math.log2(Math.max(2,pteams)));
  const last=Math.max(...Object.keys(S.days).map(Number).filter(w=>w<=S.reg+rounds*plen));
  const cur=S.cur;
  const games=S.sched.filter(([w,h,a])=>w>cur&&w<=S.reg&&a!=null).map(([w,h,a])=>[w,TI[h],TI[a]]);
  const curGames=S.sched.filter(([w,h,a])=>w===cur&&a!=null).map(([w,h,a])=>[TI[h],TI[a]]);
  const live=t=>typeof liveScore==="function"?liveScore(t):D.teams[t].live, rest=t=>typeof remaining==="function"?remaining(t):D.teams[t].rest;
  const curw=teams.map(t=>{const T=D.teams[t];const r=rest(t);return [live(t),r,Math.sqrt(Math.pow(.08*r,2)+(T.starts||0)*Math.pow(.35*(r/Math.max(1,T.starts||1)),2))]});
  const rec=teams.map(t=>{const T=D.teams[t];return [(T.w||0)+.5*(T.ti||0),T.l||0,T.pf||0]});
  return {teams,cur,last,reg:S.reg,pteams,plen,days:S.days,gpw:S.gpw,slots:D.slots.length,games,curGames,curw,rec};
}
function simPlayers(){
  const ps=D.players.map(p=>({id:p.id,t:p.t,tm:p.tm,v:p.v??p.pa,out:p.inj==="OUT"||p.inj==="INJURY_RESERVE"}));
  for(const f of (D.sim&&D.sim.fa)||[])ps.push({id:f.id,t:0,tm:f.tm,v:f.pa*(f.inj==="OUT"?0:1),out:f.inj==="OUT"});
  return ps;
}
function simRun(scen){
  return new Promise(res=>{
    if(!SIMW)SIMW=new Worker(URL.createObjectURL(new Blob([SIM_WORKER],{type:"text/javascript"})));
    SIMW.onmessage=e=>res(e.data);
    SIMW.postMessage({cfg:simCfg(),players:simPlayers(),scen,n:SIM_N,seed:20261020});
  });
}
const pct1=v=>v>=.995?">99%":v<=.005&&v>0?"<1%":Math.round(v*100)+"%";
async function renderSim(force){
  const el=$("#secSim");if(!el||!D)return;
  if(!D.sim||!D.sim.sched){el.innerHTML=`<div class="eyebrow">Season outlook</div><h2>Season simulator</h2><p class="mute">Waiting for the next data refresh to bring in the full league schedule.</p>`;return}
  if(!SIMR||force){if(simBusy)return;simBusy=true;
    el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Season outlook</div><h2>Season simulator</h2></div></div><div class="simload"><span></span>Simulating ${SIM_N.toLocaleString()} seasons…</div>`;
    const t0=performance.now();SIMR=await simRun(null);SIMR.ms=Math.round(performance.now()-t0);simBusy=false;simHist()}
  const R=SIMR,me=D.me,mi=R.teams.indexOf(me);
  const rows=R.teams.map((t,i)=>({t,i,po:R.po[i],title:R.title[i],w:R.wins[i],pf:R.pf[i],seed:R.seed[i]})).sort((a,b)=>b.po-a.po||b.title-a.title);
  const totW=D.sim.reg,mostSeed=s=>s.indexOf(Math.max(...s))+1;
  const hist=simHistGet();
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Season outlook · ${SIM_N.toLocaleString()} simulated seasons</div><h2>Season simulator</h2></div><button class="b" type="button" id="simRerun">Re-run</button></div>
    <div class="simme">
      <div class="simbig"><small>Playoffs</small><b>${pct1(R.po[mi])}</b></div>
      <div class="simbig"><small>Title</small><b>${pct1(R.title[mi])}</b></div>
      <div class="simbig"><small>Projected record</small><b>${R.wins[mi].toFixed(1)}-${(totW-R.wins[mi]).toFixed(1)}</b></div>
      <div class="simseed"><small>Where Garebears finishes</small><div class="seedbars">${R.seed[mi].map((v,k)=>`<i class="${k<D.sim.pteams?"po":""}" style="--h:${Math.max(2,v/Math.max(...R.seed[mi])*100)}%" title="#${k+1}: ${pct1(v)}"><em>${k+1}</em></i>`).join("")}</div></div>
      ${hist.length>1?`<div class="simseed"><small>Your playoff odds over time</small>${spark(hist)}</div>`:""}
    </div>
    <div class="tscroll"><table class="tbl simt"><thead><tr><th>Team</th><th>Record</th><th>Likely seed</th><th style="text-align:left">Playoffs</th><th style="text-align:left">Title</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.t==me?"mine":""}"><td><span class="nm">${esc(D.teams[r.t].name)}<small>${esc(D.teams[r.t].owner)}</small></span></td><td>${r.w.toFixed(1)}-${(totW-r.w).toFixed(1)}</td><td>#${mostSeed(r.seed)}</td>
      <td class="pb"><span class="pbw"><span class="pbar"><i style="width:${r.po*100}%"></i></span>${pct1(r.po)}</span></td><td class="pb"><span class="pbw"><span class="pbar t"><i style="width:${r.title*100}%"></i></span>${pct1(r.title)}</span></td></tr>`).join("")}</tbody></table></div>
    <div class="sandbox" id="sandbox"></div>
    <p class="faint" style="font-size:12.5px;margin:12px 0 0">Every season redraws each player's true level (about ±12% around his projection, each week swings about ±9% as a team on top of game-to-game noise) and random injuries, then plays the real league schedule with each NBA team's real games per week, capped by your ${D.slots.length} lineup slots. Top ${D.sim.pteams} make the playoffs. Ran in ${R.ms} ms.</p>`;
  $("#simRerun").onclick=()=>renderSim(true);
  renderSandbox();
}
function spark(h){const W=220,H=46,xs=h.map((_,i)=>i/(h.length-1)*W),ys=h.map(x=>H-4-x.po*(H-8));
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="spark"><polyline fill="none" stroke="var(--a)" stroke-width="2" points="${xs.map((x,i)=>x+","+ys[i]).join(" ")}"/><circle cx="${xs.at(-1)}" cy="${ys.at(-1)}" r="3" fill="var(--hi)"/></svg><span class="faint" style="font:500 11px var(--mono)">${h[0].d.slice(5)} → ${h.at(-1).d.slice(5)} · saved on this device</span>`}
function simHistGet(){try{return JSON.parse(localStorage.getItem("grindex-simhist")||"[]")}catch(e){return []}}
function simHist(){try{const h=simHistGet(),d=TODAY?TODAY():new Date().toISOString().slice(0,10),mi=SIMR.teams.indexOf(D.me);const row={d,po:SIMR.po[mi],t:SIMR.title[mi]};
  if(h.length&&h.at(-1).d===d)h[h.length-1]=row;else h.push(row);localStorage.setItem("grindex-simhist",JSON.stringify(h.slice(-200)))}catch(e){}}

/* ---------- what-if sandbox ---------- */
function renderSandbox(){
  const el=$("#sandbox");if(!el)return;const me=D.me;
  const mine=D.players.filter(p=>p.t==me).sort((a,b)=>b.v-a.v);
  const others=Object.keys(D.teams).map(Number).filter(t=>t!=me);
  if(sbTeam==null)sbTeam=others[0];
  const theirs=sbTeam===0?(D.sim.fa||[]).map(f=>({id:f.id,n:f.n,tm:f.tm,v:f.pa})):D.players.filter(p=>p.t==sbTeam).sort((a,b)=>b.v-a.v);
  const chip=(p,set,k)=>`<button type="button" class="pchip ${set.has(p.id)?"on":""}" data-${k}="${p.id}">${esc(p.n)}<small>${esc(p.tm)} · ${(+p.v).toFixed(0)}</small></button>`;
  el.innerHTML=`<div class="eyebrow" style="margin:22px 0 4px">What if?</div><h3 style="margin:0 0 12px;font:500 17px var(--sans)">Try a trade or pickup and re-run the season</h3>
    <div class="sbgrid"><div><div class="faint sbl">You give</div><div class="pchips">${mine.map(p=>chip(p,sbGive,"give")).join("")}</div></div>
      <div><div class="faint sbl">You get from <select id="sbTeam" aria-label="Team">${others.map(t=>`<option value="${t}" ${t===sbTeam?"selected":""}>${esc(D.teams[t].name)}</option>`).join("")}<option value="0" ${sbTeam===0?"selected":""}>Free agents</option></select></div><div class="pchips">${theirs.map(p=>chip(p,sbGet,"get")).join("")}</div></div></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><button class="b primary" type="button" id="sbRun" ${sbGive.size||sbGet.size?"":"disabled"}>Simulate this move</button>${sbGive.size||sbGet.size?`<button class="b" type="button" id="sbClear">Clear</button>`:""}<span class="faint" style="font-size:12.5px">${sbGive.size} out · ${sbGet.size} in${sbTeam===0&&sbGet.size>sbGive.size?" · drop someone to make room":""}</span></div>
    <div id="sbOut">${sbRes?sbResHTML(sbRes):""}</div>`;
  el.querySelectorAll("[data-give]").forEach(b=>b.onclick=()=>{const id=+b.dataset.give;sbGive.has(id)?sbGive.delete(id):sbGive.add(id);sbRes=null;renderSandbox()});
  el.querySelectorAll("[data-get]").forEach(b=>b.onclick=()=>{const id=+b.dataset.get;sbGet.has(id)?sbGet.delete(id):sbGet.add(id);sbRes=null;renderSandbox()});
  $("#sbTeam").onchange=e=>{sbTeam=+e.target.value;sbGet.clear();sbRes=null;renderSandbox()};
  const c=$("#sbClear");if(c)c.onclick=()=>{sbGive.clear();sbGet.clear();sbRes=null;renderSandbox()};
  $("#sbRun").onclick=async()=>{const b=$("#sbRun");b.disabled=true;b.textContent="Simulating…";
    const scen=[...[...sbGive].map(id=>[id,sbTeam]),...[...sbGet].map(id=>[id,D.me])];
    const S=await simRun(scen),mi=S.teams.indexOf(D.me),bi=SIMR.teams.indexOf(D.me);
    const nm=id=>(D.players.find(p=>p.id===id)||(D.sim.fa||[]).find(f=>f.id===id)||{n:id}).n;
    sbRes={give:[...sbGive].map(nm),get:[...sbGet].map(nm),from:sbTeam?D.teams[sbTeam].name:"free agency",
      a:{po:SIMR.po[bi],t:SIMR.title[bi],w:SIMR.wins[bi]},b:{po:S.po[mi],t:S.title[mi],w:S.wins[mi]},
      them:sbTeam?{name:D.teams[sbTeam].name,a:SIMR.po[SIMR.teams.indexOf(sbTeam)],b:S.po[S.teams.indexOf(sbTeam)]}:null};
    renderSandbox();requestAnimationFrame(()=>document.querySelectorAll("#sbOut .cmp i").forEach(i=>i.style.width=i.dataset.w))};
}
function sbResHTML(r){const d=(x,y)=>{const v=Math.round((y-x)*1000)/10;return `<span class="${v>0.4?"up":v<-0.4?"down":"faint"}">${v>0?"▲ ":v<0?"▼ ":""}${Math.abs(v).toFixed(1)}</span>`};
  const line=(l,a,b)=>`<div class="cmp"><span>${l}</span><div><span class="cb"><i data-w="${a*100}%" style="width:0"></i></span><b>${pct1(a)}</b></div><div><span class="cb n"><i data-w="${b*100}%" style="width:0"></i></span><b>${pct1(b)}</b></div>${d(a,b)}</div>`;
  const verdict=r.b.t-r.a.t>.01||r.b.po-r.a.po>.02?`<b class="up">Do it.</b> It makes you more likely to win the league.`:r.b.t-r.a.t<-.01||r.b.po-r.a.po<-.02?`<b class="down">Pass.</b> It lowers your chances.`:`<b>About even.</b> It barely moves your odds.`;
  return `<div class="sbres"><p style="margin:0 0 10px">${r.give.length?`Give <b>${r.give.map(esc).join(", ")}</b>`:""}${r.give.length&&r.get.length?", get ":""}${r.get.length?`<b>${r.get.map(esc).join(", ")}</b> from ${esc(r.from)}`:""}. ${verdict}</p>
    <div class="cmp hd"><span></span><span class="faint">Now</span><span class="faint">After</span><span></span></div>
    ${line("Playoffs",r.a.po,r.b.po)}${line("Title",r.a.t,r.b.t)}
    <div class="cmp"><span>Wins</span><div><b>${r.a.w.toFixed(1)}</b></div><div><b>${r.b.w.toFixed(1)}</b></div><span class="${r.b.w-r.a.w>0.05?"up":r.b.w-r.a.w<-0.05?"down":"faint"}">${r.b.w-r.a.w>=0?"+":""}${(r.b.w-r.a.w).toFixed(1)}</span></div>
    ${r.them?`<p class="faint" style="margin:10px 0 0;font-size:12.5px">${esc(r.them.name)}'s playoff odds: ${pct1(r.them.a)} → ${pct1(r.them.b)}. Same random draws in both runs, so the difference is the move, not luck.</p>`:""}</div>`}
/* used by the Trades tab "Simulate" buttons */
function simTrade(giveIds,getIds,team){sbGive=new Set(giveIds);sbGet=new Set(getIds);sbTeam=team;sbRes=null;
  const go=()=>{renderSandbox();const sb=$("#sandbox");sb.scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});setTimeout(()=>$("#sbRun")&&$("#sbRun").click(),500)};
  if(!SIMR)renderSim().then(go);else go()}
