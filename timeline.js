/* My season timeline: projection, strength, power rank and simulated playoff/title odds since the draft,
   with every add, drop, claim, injury and new matchup marked, and how each one moved the selected metric. */
let TL=null,tlMetric="po",tlHover=null,tlClaims=null;
const TLM=[["po","Playoff %",v=>Math.round(v*100)+"%",1],["title","Title %",v=>(v*100).toFixed(1)+"%",1],["wins","Projected wins",v=>v.toFixed(1),1],
  ["core","Team strength",v=>Math.round(v),1],["prank","Power rank",v=>"#"+v,-1],["wk","This week's projection",v=>Math.round(v),1]];
const EVC={add:"var(--up)",return:"var(--up)",drop:"var(--faint)",injury:"var(--down)",claim:"var(--a)",week:"rgba(255,255,255,.35)",draft:"var(--hi)"};
async function loadTL(){try{TL=await (await fetch("timeline.json?t="+Date.now(),{cache:"no-store"})).json()}catch(e){TL=null}}
async function renderTL(){
  const el=$("#secTL");if(!el)return;if(!TL)await loadTL();
  if(!TL||!TL.points||!TL.points.length){el.innerHTML=`<div class="eyebrow">Since the draft</div><h2>My season timeline</h2><p class="mute">Fills in after the next data refresh.</p>`;return}
  const P=TL.points,M=TLM.find(m=>m[0]===tlMetric),fmt=M[2],val=p=>p[tlMetric];
  const pts=P.map((p,i)=>({i,t:Date.parse(p.at),v:val(p)})).filter(x=>x.v!=null&&!isNaN(x.t));
  const W=900,H=240,L=48,R=16,T=16,B=28;
  const t0=pts[0].t,t1=pts[pts.length-1].t||t0+1,vs=pts.map(x=>x.v);let lo=Math.min(...vs),hi=Math.max(...vs);
  if(tlMetric==="po"||tlMetric==="title"){lo=0;hi=Math.max(hi*1.15,.1);if(tlMetric==="po")hi=Math.min(1,Math.max(hi,.5))}
  if(hi-lo<1e-9){hi+=1;lo-=1}const pad=(hi-lo)*.08;lo-=tlMetric==="po"||tlMetric==="title"?0:pad;hi+=pad;
  const X=t=>L+(W-L-R)*((t-t0)/((t1-t0)||1)),Y=v=>M[3]>0?T+(H-T-B)*(1-(v-lo)/(hi-lo)):T+(H-T-B)*((v-lo)/(hi-lo));
  const line=pts.map((x,k)=>`${k?"L":"M"}${X(x.t).toFixed(1)} ${Y(x.v).toFixed(1)}`).join(" ");
  const area=line+` L${X(pts.at(-1).t).toFixed(1)} ${H-B} L${X(pts[0].t).toFixed(1)} ${H-B} Z`;
  const ticks=[0,.25,.5,.75,1].map(f=>lo+(hi-lo)*f);
  const days=[];for(let d=new Date(t0);d<=t1;d=new Date(d.getTime()+864e5))days.push(d);
  const dstep=Math.max(1,Math.ceil(days.length/8));
  const E=(TL.events||[]).filter(e=>P[e.i]);
  const byPoint={};for(const e of E)(byPoint[e.i]=byPoint[e.i]||[]).push(e);
  const marks=Object.entries(byPoint).map(([i,es])=>{const p=P[+i],x=X(Date.parse(p.at)),k=es.find(e=>e.kind!=="week")||es[0];
    return `<g class="tlev" data-i="${i}"><line x1="${x}" x2="${x}" y1="${T}" y2="${H-B}" stroke="${EVC[k.kind]||"#fff"}" stroke-opacity=".35" ${k.kind==="week"?'stroke-dasharray="3 4"':""}/><circle cx="${x}" cy="${H-B}" r="5" fill="${EVC[k.kind]||"#fff"}"/></g>`}).join("");
  const delta=i=>{if(i<=0)return null;const a=val(P[i-1]),b=val(P[i]);return a==null||b==null?null:b-a};
  const dtxt=(d)=>{if(d==null)return "";const good=M[3]>0?d>0:d<0,abs=Math.abs(d);if(abs<(tlMetric==="po"||tlMetric==="title"?.005:tlMetric==="wins"?.05:.5))return `<span class="faint">no real change</span>`;
    const s=tlMetric==="po"||tlMetric==="title"?(d>0?"+":"−")+(abs*100).toFixed(1)+" pts":tlMetric==="prank"?(d<0?"up ":"down ")+abs+" spot"+(abs>1?"s":""):(d>0?"+":"−")+(tlMetric==="wins"?abs.toFixed(1):Math.round(abs));
    return `<span class="${good?"up":"down"}">${s}</span>`};
  const evList=Object.entries(byPoint).sort((a,b)=>b[0]-a[0]).map(([i,es])=>{const p=P[+i],d=delta(+i);
    return `<li data-i="${i}"><span class="tld">${new Date(p.at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span><div>${es.map(e=>`<span class="tlk" style="--c:${EVC[e.kind]}">${esc(e.text)}</span>`).join("")}</div><span class="tlv">${+i>0?`${fmt(val(P[+i-1]))} → <b>${fmt(val(p))}</b> ${dtxt(d)}`:`<b>${fmt(val(p))}</b>`}</span></li>`}).join("");
  const cur=P.at(-1),first=P[0];
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Since the draft · ${P.length} snapshots</div><h2>My season timeline</h2></div>
    <div class="tlnow"><span class="faint">${M[1]} now</span><b>${fmt(val(cur))}</b><span>${dtxt(val(cur)-val(first))} <span class="faint">since the draft</span></span></div></div>
    <div class="filters tlf">${TLM.map(m=>`<button type="button" class="fchip" data-m="${m[0]}" aria-selected="${m[0]===tlMetric}">${m[1]}</button>`).join("")}</div>
    <div class="tlchart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${M[1]} over time">
      <defs><linearGradient id="tlg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--a)" stop-opacity=".35"/><stop offset="1" stop-color="var(--a)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.07)"/><text x="${L-8}" y="${Y(v)+4}" text-anchor="end" class="tlax">${fmt(tlMetric==="prank"?Math.round(v):v)}</text>`).join("")}
      ${days.filter((_,k)=>k%dstep===0).map(d=>`<text x="${X(d.getTime())}" y="${H-8}" text-anchor="middle" class="tlax">${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</text>`).join("")}
      ${marks}<path d="${area}" fill="url(#tlg)"/><path d="${line}" fill="none" stroke="var(--a)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      ${pts.map(x=>`<circle cx="${X(x.t)}" cy="${Y(x.v)}" r="2.5" fill="var(--hi)"/>`).join("")}
      <circle id="tlDot" r="6" fill="var(--hi)" stroke="#0b0b0d" stroke-width="2" style="display:none"/></svg><div class="tltip" id="tlTip" hidden></div></div>
    <div class="tllegend">${[["add","Added"],["drop","Dropped"],["claim","Claim placed"],["injury","Injury"],["return","Healthy"],["week","New matchup"]].map(([k,l])=>`<span><i style="background:${EVC[k]}"></i>${l}</span>`).join("")}</div>
    <div id="tlClaims"></div>
    <div class="eyebrow" style="margin:18px 0 8px">What changed · effect on ${M[1].toLowerCase()}</div><ul class="tllist">${evList}</ul>
    <p class="faint" style="font-size:12.5px;margin:10px 0 0">Each snapshot re-runs a 3,000-season simulation with your roster, injuries and record at that moment. The change shown is from the snapshot before the event to the one after it, so news that landed at the same time shares the same change.</p>`;
  el.querySelector(".tlf").onclick=e=>{const b=e.target.closest("[data-m]");if(b){tlMetric=b.dataset.m;renderTL()}};
  const svg=el.querySelector("svg"),tip=$("#tlTip"),dot=$("#tlDot");
  const show=ev=>{const r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width*W;let best=pts[0];for(const q of pts)if(Math.abs(X(q.t)-x)<Math.abs(X(best.t)-x))best=q;
    const p=P[best.i],es=byPoint[best.i]||[];dot.style.display="";dot.setAttribute("cx",X(best.t));dot.setAttribute("cy",Y(best.v));
    tip.hidden=false;tip.style.left=Math.min(r.width-220,Math.max(0,X(best.t)/W*r.width-110))+"px";
    tip.innerHTML=`<div class="faint">${esc(p.pulled||new Date(p.at).toLocaleString())}</div><b>${fmt(best.v)}</b> ${dtxt(delta(best.i))}${es.map(e=>`<div class="tlk" style="--c:${EVC[e.kind]}">${esc(e.text)}</div>`).join("")}`};
  svg.addEventListener("pointermove",show);svg.addEventListener("pointerdown",show);svg.addEventListener("pointerleave",()=>{tip.hidden=true;dot.style.display="none"});
  tlPending();
}
/* what your pending claims would do, using the full simulator with the same random draws */
async function tlPending(){
  const el=$("#tlClaims");if(!el||typeof simRun!=="function")return;
  const mine=(D.league_pending||[]).filter(c=>c.mine);if(!mine.length){el.innerHTML="";return}
  const scen=[];for(const c of mine)for(const i of c.items){if(!i.pid)continue;scen.push([i.pid,i.kind==="ADD"?D.me:0])}
  const key=JSON.stringify(scen);
  if(!tlClaims||tlClaims.key!==key){el.innerHTML=`<div class="tlpend faint">Simulating your pending claims…</div>`;
    if(!SIMR)SIMR=await simRun(null);const S=await simRun(scen);const a=SIMR.teams.indexOf(D.me),b=S.teams.indexOf(D.me);
    tlClaims={key,po:[SIMR.po[a],S.po[b]],t:[SIMR.title[a],S.title[b]],w:[SIMR.wins[a],S.wins[b]]}}
  const C=tlClaims,f=v=>Math.round(v*100)+"%",d=(x,y,p)=>{const v=p?(y-x)*100:(y-x);return `<span class="${v>0.3?"up":v<-0.3?"down":"faint"}">${v>0?"+":""}${v.toFixed(1)}${p?" pts":""}</span>`};
  el.innerHTML=`<div class="tlpend"><div class="eyebrow">If your pending claims go through</div><div>${mine.map(c=>c.items.map(i=>`${i.kind==="ADD"?"add":"drop"} ${esc(i.n)}`).join(", ")).join(" · ")}</div>
    <div class="tlpn"><span>Playoffs ${f(C.po[0])} → <b>${f(C.po[1])}</b> ${d(C.po[0],C.po[1],1)}</span><span>Title ${f(C.t[0])} → <b>${f(C.t[1])}</b> ${d(C.t[0],C.t[1],1)}</span><span>Wins ${C.w[0].toFixed(1)} → <b>${C.w[1].toFixed(1)}</b> ${d(C.w[0],C.w[1])}</span></div></div>`;
}
let tlIO=null;
function tlWhenVisible(){const el=$("#secTL");if(!el)return;TL=null;
  if(!("IntersectionObserver" in window)){renderTL();return}
  if(tlIO)tlIO.disconnect();tlIO=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){tlIO.disconnect();tlIO=null;renderTL()}},{rootMargin:"400px"});tlIO.observe(el)}
