/* Mini hoop: arcade shooting in the Arena. Each shot is two taps: lock the aim (a marker sweeps left and right),
   then press and hold to fill the shot meter and let go in the green. Aim and release each get a grade
   (perfect, good, bad, horrible); the combination decides the shot. 30 or 60 seconds, best scores kept on this device. */
const HG={mode:30,state:"idle",t0:0,left:0,makes:0,att:0,pts:0,streak:0,best:0,aimT:0,aim:0,pow:0,powT:0,shot:null,msg:null,raf:0,last:0};
const HG_K="grindex-hoops";
const HG_GR=["horrible","bad","good","perfect"];
const hgLoad=()=>{try{return JSON.parse(localStorage.getItem(HG_K)||"{}")}catch(e){return {}}};
const hgSave=o=>{try{localStorage.setItem(HG_K,JSON.stringify(o))}catch(e){}};
const aimGrade=e=>{e=Math.abs(e);return e<.06?3:e<.16?2:e<.32?1:0};          // aim error: -1..1 across the bar
const relGrade=r=>{const e=Math.abs(r-.9);return e<.025?3:e<.065?2:e<.14?1:0};  // release point on the meter: 0..1.15, green at .9
const MAKE=[0,.03,.12,.38,.68,.9,1];  // make chance by aim+release grade total (0..6)

function renderHoops(){
  const el=$("#aHoops");if(!el)return;
  if(el.dataset.ready)return;el.dataset.ready="1";
  const H=hgLoad();
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Arcade · just for fun</div><h2>Mini hoop</h2></div>
      <div class="hgmodes" role="group" aria-label="Game length"><button type="button" class="hgm on" data-m="30">30 sec</button><button type="button" class="hgm" data-m="60">60 sec</button></div></div>
    <div class="hgwrap"><canvas id="hgC" aria-label="Mini hoop game. Tap to lock aim, then hold and release to shoot." role="img"></canvas>
      <div class="hghud"><span><b id="hgPts">0</b> pts</span><span><b id="hgMk">0</b>/<span id="hgAt">0</span></span><span class="hgtime"><b id="hgT">30</b>s</span></div>
      <div class="hgover" id="hgOver"></div></div>
    <p class="faint" style="font-size:12.5px;margin:10px 0 0">Tap (or space) to lock your aim, then press and hold to fill the meter and let go in the green. Make = 2, perfect aim and release = 3. High scores stay on this device.</p>`;
  el.querySelectorAll(".hgm").forEach(b=>b.onclick=()=>{if(HG.state!=="idle"&&HG.state!=="over")return;HG.mode=+b.dataset.m;el.querySelectorAll(".hgm").forEach(x=>x.classList.toggle("on",x===b));$("#hgT").textContent=HG.mode;hgOverlay()});
  const c=$("#hgC");
  const fit=()=>{const w=c.clientWidth;if(!w)return;const h=Math.round(Math.min(460,Math.max(320,w*.62)));c.style.height=h+"px";const d=Math.min(2,devicePixelRatio||1);c.width=w*d;c.height=h*d;hgDraw()};
  new ResizeObserver(fit).observe(c);
  c.addEventListener("pointerdown",e=>{e.preventDefault();hgDown()});
  addEventListener("pointerup",()=>hgUp());
  c.tabIndex=0;
  c.addEventListener("keydown",e=>{if(e.code==="Space"||e.key==="Enter"){e.preventDefault();if(!e.repeat)hgDown()}});
  c.addEventListener("keyup",e=>{if(e.code==="Space"||e.key==="Enter"){e.preventDefault();hgUp()}});
  hgOverlay();
}
function hgOverlay(){
  const o=$("#hgOver");if(!o)return;const H=hgLoad(),best=(H[HG.mode]||[]);
  if(HG.state==="idle"||HG.state==="over"){
    const res=HG.state==="over"?`<div class="hgres"><b>${HG.pts}</b> points · ${HG.makes}/${HG.att} (${HG.att?Math.round(HG.makes/HG.att*100):0}%)${HG.best?` · best streak ${HG.best}`:""}${HG.newHigh?`<div class="hgnew">New high score!</div>`:""}</div>`:"";
    o.innerHTML=`${res}<button class="b primary hgstart" type="button" id="hgGo">${HG.state==="over"?"Play again":"Start"} · ${HG.mode} sec</button>
      ${best.length?`<div class="hghs"><div class="eyebrow">High scores · ${HG.mode} sec</div>${best.slice(0,5).map((s,i)=>`<div><span>${i+1}</span><b>${s.p}</b><small>${s.m}/${s.a} · ${s.d}</small></div>`).join("")}</div>`:""}`;
    o.hidden=false;$("#hgGo").onclick=e=>{e.stopPropagation();hgStart()};
  }else o.hidden=true;
}
function hgStart(){
  Object.assign(HG,{state:"aim",t0:performance.now(),left:HG.mode,makes:0,att:0,pts:0,streak:0,best:0,aimT:performance.now(),shot:null,msg:null,newHigh:false});
  hgHud();hgOverlay();$("#hgC").focus({preventScroll:true});cancelAnimationFrame(HG.raf);HG.raf=requestAnimationFrame(hgLoop);
}
function hgDown(){
  if(HG.state==="aim"){HG.aim=hgAimPos(performance.now());HG.state="lock"}   // aim locked; next press fills the meter
  else if(HG.state==="lock"){HG.state="power";HG.powT=performance.now()}
}
function hgUp(){if(HG.state==="power")hgShoot(hgPow(performance.now()))}
const hgAimPos=t=>Math.sin((t-HG.aimT)/1000*(2.4+Math.min(HG.streak,8)*.18))*1;   // sweeps faster on a streak
const hgPow=t=>Math.min(1.15,(t-HG.powT)/780);
function hgShoot(r){
  const ag=aimGrade(HG.aim),rg=relGrade(r),q=ag+rg,made=Math.random()<MAKE[q];
  const swish=made&&ag===3&&rg===3;
  const kind=made?(q>=5?"swish":"rim in"):(q>=2?"rim out":q===1?"brick":"airball");
  HG.att++;if(made){HG.makes++;HG.pts+=swish?3:2;HG.streak++;HG.best=Math.max(HG.best,HG.streak)}else HG.streak=0;
  HG.shot={t:performance.now(),aim:HG.aim,rel:r,made,kind,ag,rg};
  HG.msg={t:performance.now(),top:made?(swish?"SWISH!":"BUCKET"):kind.toUpperCase(),sub:`${HG_GR[ag]} aim · ${HG_GR[rg]} release${r<.9-.065?" (early)":r>.9+.065?" (late)":""}`,good:made,fire:HG.streak>=3};
  HG.state="fly";hgHud();
}
function hgHud(){$("#hgPts").textContent=HG.pts;$("#hgMk").textContent=HG.makes;$("#hgAt").textContent=HG.att;$("#hgT").textContent=Math.ceil(HG.left)}
function hgLoop(now){
  HG.left=Math.max(0,HG.mode-(now-HG.t0)/1000);
  if(HG.state==="fly"&&now-HG.shot.t>950){HG.state=HG.left>0?"aim":"over";HG.aimT=now}
  if(HG.left<=0&&HG.state!=="fly"&&HG.state!=="over")HG.state="over";
  if(HG.state==="power"&&hgPow(now)>=1.15)hgShoot(1.15);   // held too long: late
  hgHud();hgDraw(now);
  if(HG.state==="over"){hgEnd();return}
  HG.raf=requestAnimationFrame(hgLoop);
}
function hgEnd(){
  const H=hgLoad(),L=H[HG.mode]||[];const rec={p:HG.pts,m:HG.makes,a:HG.att,d:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})};
  HG.newHigh=HG.pts>0&&(!L.length||HG.pts>L[0].p);
  if(HG.att)L.push(rec);L.sort((a,b)=>b.p-a.p||b.m-a.m);H[HG.mode]=L.slice(0,10);hgSave(H);hgOverlay();
}

/* drawing */
function hgDraw(now=performance.now()){
  const c=$("#hgC");if(!c||!c.clientWidth||!c.width)return;const x=c.getContext("2d"),W=c.width,Hh=c.height,d=W/c.clientWidth;
  const cs=getComputedStyle(document.body),acc=cs.getPropertyValue("--a").trim()||"#9ef0c4";
  x.clearRect(0,0,W,Hh);
  // floor and backdrop
  const g=x.createLinearGradient(0,0,0,Hh);g.addColorStop(0,"#15161a");g.addColorStop(.72,"#1b1c21");g.addColorStop(.721,"#2a2018");g.addColorStop(1,"#3a2a1c");x.fillStyle=g;x.fillRect(0,0,W,Hh);
  x.strokeStyle="rgba(255,255,255,.06)";x.lineWidth=2*d;x.beginPath();x.ellipse(W/2,Hh*.98,W*.34,Hh*.1,0,Math.PI,2*Math.PI);x.stroke();
  // backboard, rim, net
  const rx=W/2,ry=Hh*.34,rr=Math.min(W*.075,46*d);
  x.fillStyle="rgba(255,255,255,.92)";x.fillRect(rx-rr*2.4,ry-rr*2.5,rr*4.8,rr*2.7);
  x.strokeStyle=acc;x.lineWidth=3*d;x.strokeRect(rx-rr*.8,ry-rr*1.5,rr*1.6,rr*1.25);
  x.fillStyle="#555";x.fillRect(rx-3*d,ry-rr*.2,6*d,rr*.25);
  const sw=HG.shot&&HG.shot.made&&now-HG.shot.t>520&&now-HG.shot.t<900;
  x.strokeStyle="rgba(255,255,255,.7)";x.lineWidth=1.2*d;
  for(let i=0;i<=6;i++){const t=i/6,top=rx-rr+t*rr*2,bot=rx-rr*.55+t*rr*1.1+(sw?Math.sin(now/40+i)*3*d:0);x.beginPath();x.moveTo(top,ry);x.lineTo(bot,ry+rr*1.15+(sw?6*d:0));x.stroke()}
  for(let k=1;k<=2;k++){const yy=ry+rr*.4*k,w=rr*(1-.22*k);x.beginPath();x.moveTo(rx-w,yy);x.lineTo(rx+w,yy);x.stroke()}
  // ball
  let bx=rx,by=Hh*.86,bs=rr*.62,front=true;
  if(HG.shot&&HG.state==="fly"){
    const S=HG.shot,p=Math.min(1,(now-S.t)/700),aimX=S.aim*rr*2.2,relY=(S.rel-.9)*rr*6;
    let tx=rx+(S.made?aimX*.15:aimX),ty=ry+(S.made?0:-relY*.6);
    if(S.kind==="airball"){ty=ry+rr*.9;tx=rx+aimX*1.6+(S.rel<.9?0:rr*1.5)}
    bx=rx+(tx-rx)*p;by=Hh*.86+(ty-Hh*.86)*p-Math.sin(p*Math.PI)*Hh*.42;bs=rr*(.62-.2*p);
    if(p>=1){const q=Math.min(1,(now-S.t-700)/250);
      if(S.made){bx=tx+(rx-tx)*q;by=ty+q*rr*1.6;front=q<.3}
      else if(S.kind==="rim out"||S.kind==="brick"){bx=tx+Math.sign(aimX||1)*q*rr*2;by=ty-Math.sin(q*Math.PI)*rr*.9+q*rr}
      else{by=ty+q*rr*2}}
    if(p<.75)front=true;else if(!S.made)front=true;
  }
  const ball=()=>{const r=bs;x.save();x.translate(bx,by);
    const bg=x.createRadialGradient(-r*.35,-r*.35,r*.1,0,0,r);bg.addColorStop(0,"#ffb25e");bg.addColorStop(1,"#d1621b");x.fillStyle=bg;x.beginPath();x.arc(0,0,r,0,7);x.fill();
    x.strokeStyle="rgba(40,20,5,.7)";x.lineWidth=1.4*d;x.beginPath();x.arc(0,0,r,0,7);x.moveTo(-r,0);x.lineTo(r,0);x.moveTo(0,-r);x.lineTo(0,r);x.stroke();x.restore()};
  if(!front)ball();
  x.strokeStyle="#ff6a1f";x.lineWidth=4*d;x.beginPath();x.ellipse(rx,ry,rr,rr*.22,0,0,2*Math.PI);x.stroke();
  if(front)ball();
  // aim bar
  const st=HG.state,bw=Math.min(W*.6,360*d),bxL=(W-bw)/2,byA=Hh*.62;
  if(st==="aim"||st==="lock"||st==="power"){
    x.fillStyle="rgba(255,255,255,.08)";x.fillRect(bxL,byA,bw,8*d);
    [[.32,"rgba(255,90,90,.25)"],[.16,"rgba(255,200,90,.35)"],[.06,"rgba(158,240,196,.7)"]].forEach(([e,col])=>{x.fillStyle=col;x.fillRect(W/2-e*bw/2,byA,e*bw,8*d)});
    const a=st==="aim"?hgAimPos(now):HG.aim,ax=W/2+a*bw/2;x.fillStyle="#fff";x.fillRect(ax-2*d,byA-6*d,4*d,20*d);
    x.fillStyle="rgba(255,255,255,.75)";x.font=`500 ${12*d}px Inter,system-ui,sans-serif`;x.textAlign="center";
    x.fillText(st==="aim"?"Tap to lock aim":st==="lock"?"Hold to shoot, let go in the green":"",W/2,byA+30*d);
  }
  // shot meter (2K style: vertical bar beside the shooter)
  if(st==="lock"||st==="power"||(st==="fly"&&now-HG.shot.t<500)){
    const mh=Hh*.34,mw=12*d,mx=W/2+bw/2+26*d>W-30*d?W-30*d:W/2+bs+40*d,my=Hh*.92-mh;
    x.fillStyle="rgba(255,255,255,.1)";x.fillRect(mx,my,mw,mh);
    const yAt=v=>my+mh-(v/1.15)*mh;
    x.fillStyle="rgba(255,200,90,.35)";x.fillRect(mx,yAt(.9+.065),mw,yAt(.9-.065)-yAt(.9+.065));
    x.fillStyle="rgba(158,240,196,.95)";x.fillRect(mx,yAt(.9+.025),mw,yAt(.9-.025)-yAt(.9+.025));
    const v=st==="power"?hgPow(now):st==="fly"?HG.shot.rel:0;
    x.fillStyle="#fff";x.fillRect(mx-3*d,yAt(v)-2*d,mw+6*d,4*d);
  }
  // result text
  if(HG.msg&&now-HG.msg.t<1100){const m=HG.msg,a=Math.min(1,(1100-(now-m.t))/300);x.globalAlpha=a;x.textAlign="center";
    x.fillStyle=m.good?"#9ef0c4":"#ff8f8f";x.font=`800 ${30*d}px Inter,system-ui,sans-serif`;x.fillText(m.top,W/2,Hh*.53);
    x.fillStyle="rgba(255,255,255,.85)";x.font=`500 ${13*d}px Inter,system-ui,sans-serif`;x.fillText(m.sub+(m.fire?` · ${HG.streak} straight 🔥`:""),W/2,Hh*.53+22*d);x.globalAlpha=1}
}
renderHoops();
