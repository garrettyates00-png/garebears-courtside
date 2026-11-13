/* Grindex Jam: a tiny 2-on-2 arcade game in 8-bit, desktop only.
   You're red (Garebears), attacking the right hoop. WASD to move, Shift for turbo.
   Offense: hold the mouse (or Space) to rise into a jumper and let go at the top of the meter, in the green.
            The green window shrinks the closer a defender is. Hold Shift near the rim for a dunk.
            Right-click (or E) passes to your teammate; you take control of whoever has the ball.
   Defense: right-click (or E) to swipe for a steal, hold the mouse (or Space) to jump and contest or block.
            Q switches to your other player. Three makes in a row and you're on fire.
   2-minute games, 12-second shot clock. Everything runs on one small canvas and stops when you scroll away. */
const JW=320,JH=180,SQ=.6,HOOP=[{x:24,y:124},{x:296,y:124}],COURT={x0:6,x1:314,y0:80,y1:172};
const JTEAM=[{name:"GAREBEARS",c:"#e8433f",d:"#8e1f1c",t:"#ffd84a"},{name:"BOTS",c:"#3f7fe8",d:"#1c3f8e",t:"#ffffff"}];
const J={state:"idle",keys:{},mouse:false,raf:0,last:0,ctx:null,cv:null,bg:null,msg:null,msgT:0,fx:[],shake:0};
const jd=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)/SQ);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);

function jNew(){
  const P=(team,i,num)=>({team,i,num,x:0,y:0,z:0,vz:0,turbo:1,stun:0,cd:0,shoot:null,fire:0,streak:0,anim:0});
  J.p=[P(0,0,"23"),P(0,1,"7"),P(1,0,"11"),P(1,1,"3")];
  J.score=[0,0];J.shotTeam=0;J.t=0;J.clock=120;J.shot=12;J.ball={st:"held",own:null,x:0,y:0,z:0};J.ctrl=J.p[0];J.fire=[0,0];
  jTip(0);
}
function jMine(t){return J.p.filter(p=>p.team===t)}
function jTip(team){   // team gets the ball at its own end (inbound after a score, or the opening)
  const att=team===0?1:0,own=HOOP[1-att];
  const dir=att===1?1:-1;
  J.p.forEach(p=>{const mine=p.team===team,k=p.i;
    p.x=own.x+dir*(mine?(k?60:30):(k?95:70));p.y=own.y+(k?28:-22)*(mine?1:-1);p.z=0;p.vz=0;p.shoot=null;p.stun=0});
  const h=jMine(team)[0];J.ball={st:"held",own:h};J.shot=12;
  if(team===0)J.ctrl=h;else J.ctrl=jNearest(0,h);
}
function jNearest(team,t){return jMine(team).sort((a,b)=>jd(a,t)-jd(b,t))[0]}
function jSay(t,c){J.msg={t,c:c||"#ffd84a"};J.msgT=1.4}

/* ---------- input ---------- */
function jKeys(on){
  const kd=e=>{if(J.state!=="play"&&J.state!=="over"&&J.state!=="paused")return;if(document.activeElement!==J.cv)return;
    const k=e.key.toLowerCase();if(["w","a","s","d","shift"," ","e","q"].includes(k)){e.preventDefault()}
    if(J.keys[k])return;J.keys[k]=true;
    if(k===" ")jPress(true);if(k==="e")jAlt();if(k==="q")jSwitch()};
  const ku=e=>{const k=e.key.toLowerCase();J.keys[k]=false;if(k===" ")jPress(false)};
  addEventListener("keydown",kd);addEventListener("keyup",ku);
}
function jPress(down){
  if(J.state!=="play")return;const me=J.ctrl;
  if(down){if(J.ball.st==="held"&&J.ball.own===me)jStartShot(me,!!J.keys.shift);else if(me.z===0&&me.stun<=0)me.vz=150}
  else if(me.shoot)jRelease(me);
}
function jAlt(){if(J.state!=="play")return;const me=J.ctrl;
  if(J.ball.st==="held"&&J.ball.own===me&&!me.shoot)jPass(me);
  else if(J.ball.st==="held"&&J.ball.own&&J.ball.own.team===1)jSteal(me)}
function jSwitch(){if(J.ball.st==="held"&&J.ball.own&&J.ball.own.team===0)return;J.ctrl=jMine(0).find(p=>p!==J.ctrl)}

/* ---------- basketball ---------- */
function jContest(s){let c=0;for(const d of J.p){if(d.team===s.team)continue;const k=clamp((24-jd(d,s))/18,0,1)*(d.z>3?1:.6);c=Math.max(c,k)}return c}
function jStartShot(p,turbo){
  if(p.shoot||p.stun>0)return;const h=HOOP[p.team===0?1:0],dd=jd(p,h);
  const dunk=dd<30&&turbo&&p.turbo>.15;
  p.shoot={t:0,dur:dunk?.42:.8,dunk,dd,c:jContest(p),ai:1+(Math.random()-.5)*.18};p.vz=dunk?205:120;if(dunk)p.turbo=Math.max(0,p.turbo-.3);
}
function jRelease(p,auto){
  const s=p.shoot;if(!s)return;p.shoot=null;
  const h=HOOP[p.team===0?1:0],dd=jd(p,h),c=Math.max(s.c,jContest(p)),fire=J.fire[p.team]>0;
  const r=s.t/s.dur,e=Math.abs(r-1),w=(s.dunk?.22:.12)*(1-.55*c)+(fire?.05:0);
  const grade=auto?"late":e<w*.35?"perfect":e<w?"good":r<1?"early":"late";
  // a defender in the air right on top of the shot can block it
  for(const d of J.p)if(d.team!==p.team&&d.z>6&&jd(d,p)<13&&Math.random()<(s.dunk?.25:.45)){
    jSay("REJECTED!","#ff6b6b");J.shake=.25;J.ball={st:"loose",x:p.x,y:p.y,z:p.z+14,vx:rnd(-60,60),vy:rnd(-30,30),vz:60};jFx(p.x,p.y-p.z-14,"#fff");return}
  let base=s.dunk?.88:dd<34?.78:dd<80?.58:.46;
  let pm=grade==="perfect"?Math.min(.98,base+.38):grade==="good"?base+.08:base*.25;
  pm-=c*(s.dunk?.25:.3);if(fire)pm+=.15;pm=clamp(pm,.02,.98);
  const make=Math.random()<pm,pts=dd>80?3:2;
  p.lastGrade=grade;
  J.ball={st:"shot",own:p,sx:p.x,sy:p.y,sz:p.z+16,t:0,dur:s.dunk?.18:clamp(.45+dd/300,.5,1),make,pts,h,dunk:s.dunk,grade};
  if(p.team===0)jSay(grade==="perfect"?"PERFECT":grade==="good"?"GOOD":grade==="early"?"EARLY":"LATE",grade==="perfect"?"#7dff8a":grade==="good"?"#ffd84a":"#ff8a6b");
}
function jPass(p){const to=jMine(p.team).find(x=>x!==p);J.ball={st:"pass",own:p,to,sx:p.x,sy:p.y,t:0,dur:clamp(jd(p,to)/260,.18,.5)};
  // a defender standing in the lane can pick it off
  for(const d of J.p)if(d.team!==p.team){const t=((d.x-p.x)*(to.x-p.x)+(d.y-p.y)*(to.y-p.y))/Math.max(1,(to.x-p.x)**2+(to.y-p.y)**2);
    if(t>.15&&t<.85){const qx=p.x+(to.x-p.x)*t,qy=p.y+(to.y-p.y)*t;if(jd(d,{x:qx,y:qy})<7&&Math.random()<.55){J.ball.picked=d;J.ball.dur*=t}}}}
function jSteal(p){if(p.cd>0||p.stun>0)return;p.cd=.7;const h=J.ball.own;if(!h||jd(p,h)>14)return;
  const moving=Math.hypot(h.vx||0,h.vy||0)>10;let ch=(p.team===0?.3:.24)+(moving?0:.15)-(h.shoot?.1:0);
  if(Math.random()<ch){jGive(p);jSay(p.team===0?"STOLEN!":"PICKED","#7dff8a");jFx(p.x,p.y-16,"#ffd84a")}else{p.stun=.3}}
function jGive(p){const flip=J.ball.own&&J.ball.own.team!==p.team;J.ball={st:"held",own:p};if(flip||J.shotTeam!==p.team){J.shot=12;J.shotTeam=p.team}
  if(p.team===0)J.ctrl=p;else if(J.ctrl.team===0&&J.ball.own.team===1&&flip)J.ctrl=jNearest(0,p)}
function jScore(b){const t=b.own.team;J.score[t]+=b.pts;
  const s=b.own;s.streak=(s.streak||0)+1;jMine(1-t).forEach(x=>x.streak=0);
  if(J.fire[1-t]>0){J.fire[1-t]=0}
  if(s.streak>=3&&!J.fire[t]){J.fire[t]=3;jSay(t===0?"HE'S ON FIRE!":"THEY'RE HEATING UP","#ff8a2a")}
  else if(J.fire[t])J.fire[t]--;
  if(!J.msgT||J.msgT<.6)jSay(b.dunk?"BOOMSHAKALAKA!":b.pts===3?"FROM DOWNTOWN!":"",b.dunk?"#ffd84a":"#fff");
  J.shake=b.dunk?.35:.12;for(let i=0;i<10;i++)jFx(b.h.x,b.h.y-36,J.fire[t]?"#ff8a2a":"#fff");
  J.ball={st:"dead",t:.9,next:1-t,x:b.h.x,y:b.h.y,z:20}}
function jFx(x,y,c){for(let i=0;i<6;i++)J.fx.push({x,y,vx:rnd(-40,40),vy:rnd(-50,10),t:rnd(.3,.6),c})}

/* ---------- AI ---------- */
function jAI(p,dt){
  const b=J.ball,att=HOOP[p.team===0?1:0],def=HOOP[p.team===0?0:1];let tx=p.x,ty=p.y,turbo=false;
  if(b.st==="held"&&b.own.team===p.team){
    if(b.own===p){                                   // with the ball: drive, shoot when open, pass when pressured
      const dd=jd(p,att),c=jContest(p),mate=jMine(p.team).find(x=>x!==p),mateOpen=jContest(mate)<.3;
      tx=att.x+(p.team===0?-20:20);ty=att.y+Math.sin(p.anim*.7+p.i)*25;turbo=dd<70&&p.turbo>.4;
      if(!p.shoot){
        if((dd<34&&c<.7)||(dd<84&&c<.3&&Math.random()<dt*2)||J.shot<2.2)jStartShot(p,turbo);
        else if(c>.6&&mateOpen&&Math.random()<dt*1.5)jPass(p)}
      else if(p.shoot.t>=p.shoot.dur*p.shoot.ai)jRelease(p);
    }else{                                            // spacing: wing on the other side, or cut when open
      tx=att.x+(p.team===0?-62:62);ty=b.own.y>124?100:150;if(jContest(p)<.2&&Math.random()<.002)ty=att.y}
  }else if(b.st==="held"&&b.own.team!==p.team){      // defense: stay between your man and the rim
    const mates=jMine(p.team),them=jMine(1-p.team);const man=them[p.i];
    const onBall=man===b.own;const g=onBall?.22:.4;tx=man.x+(def.x-man.x)*g;ty=man.y+(def.y-man.y)*g;turbo=jd(p,man)>30;
    if(onBall&&jd(p,man)<13&&p.cd<=0&&Math.random()<dt*.9)jSteal(p);
    if(man.shoot&&jd(p,man)<24&&p.z===0&&Math.random()<dt*7)p.vz=145;
  }else if(b.st==="loose"||b.st==="shot"){           // rebound
    const tgt=b.st==="loose"?b:b.h;tx=tgt.x+(b.st==="shot"?(p.i?8:-8):0);ty=tgt.y+(b.st==="shot"?(p.i?8:-8):0);turbo=true;
  }
  jMove(p,tx-p.x,ty-p.y,turbo,dt,true);
}
function jMove(p,dx,dy,turbo,dt,ai){
  const n=Math.hypot(dx,dy/SQ);if(ai&&n<3){p.vx=p.vy=0;return}
  if(p.stun>0||p.shoot){p.vx=p.vy=0;return}
  const has=J.ball.st==="held"&&J.ball.own===p,sp=(turbo&&p.turbo>.05?92:58)*(has?.9:1);
  if(turbo&&n>0)p.turbo=Math.max(0,p.turbo-dt*.45);
  p.vx=n?dx/n*sp:0;p.vy=n?dy/n*sp:0;p.x=clamp(p.x+p.vx*dt,COURT.x0+4,COURT.x1-4);p.y=clamp(p.y+p.vy*dt,COURT.y0+4,COURT.y1-2);
}

/* ---------- step ---------- */
function jStep(dt){
  J.clock-=dt;J.shot-=dt;J.msgT=Math.max(0,J.msgT-dt);J.shake=Math.max(0,J.shake-dt);
  const b=J.ball;
  // you
  const me=J.ctrl;let dx=(J.keys.d?1:0)-(J.keys.a?1:0),dy=(J.keys.s?1:0)-(J.keys.w?1:0);
  jMove(me,dx,dy*SQ,!!J.keys.shift,dt,false);
  for(const p of J.p){if(p!==me)jAI(p,dt);
    p.anim+=dt*6;p.cd=Math.max(0,p.cd-dt);p.stun=Math.max(0,p.stun-dt);if(!J.keys.shift||p!==me)p.turbo=Math.min(1,p.turbo+dt*.18);
    if(p.vz||p.z>0){p.z+=p.vz*dt;p.vz-=420*dt;if(p.z<=0){p.z=0;p.vz=0}}
    if(p.shoot){p.shoot.t+=dt;if(p.shoot.t>p.shoot.dur*1.45)jRelease(p,true)}}
  if(b.st==="held"){b.x=b.own.x;b.y=b.own.y;if(J.shot<=0){jSay("SHOT CLOCK","#ff8a6b");jTip(1-b.own.team);J.shotTeam=1-J.shotTeam}}
  else if(b.st==="pass"){b.t+=dt;const k=b.t/b.dur,to=b.picked||b.to;b.x=b.sx+(to.x-b.sx)*k;b.y=b.sy+(to.y-b.sy)*k;b.z=12+Math.sin(k*Math.PI)*8;
    if(k>=1){if(b.picked){jGive(b.picked);jSay(b.picked.team===0?"PICKED OFF!":"INTERCEPTED","#7dff8a")}else{jGive(b.to)}}}
  else if(b.st==="shot"){b.t+=dt;const k=Math.min(1,b.t/b.dur),hz=36;
    b.x=b.sx+(b.h.x-b.sx)*k;b.y=b.sy+(b.h.y-b.sy)*k;b.z=b.sz+(hz-b.sz)*k+Math.sin(k*Math.PI)*(b.dunk?6:24+jd({x:b.sx,y:b.sy},b.h)*.12);
    if(k>=1){if(b.make)jScore(b);else{J.ball={st:"loose",x:b.h.x,y:b.h.y,z:hz,vx:(b.h.x<160?1:-1)*rnd(20,70),vy:rnd(-40,40),vz:rnd(30,80),ignore:.15};
      if(b.own.team===0)jSay("CLANK","#ff8a6b");b.own.streak=0}}}
  else if(b.st==="loose"){b.ignore=Math.max(0,(b.ignore||0)-dt);b.x=clamp(b.x+b.vx*dt,COURT.x0,COURT.x1);b.y=clamp(b.y+b.vy*dt,COURT.y0,COURT.y1);b.z+=b.vz*dt;b.vz-=300*dt;
    if(b.z<=0){b.z=0;b.vz=Math.abs(b.vz)*.45;b.vx*=.7;b.vy*=.7}
    if(!b.ignore)for(const p of J.p)if(jd(p,b)<10&&b.z<p.z+24){jGive(p);J.shot=12;J.shotTeam=p.team;break}}
  else if(b.st==="dead"){b.t-=dt;b.z=Math.max(0,b.z-dt*40);if(b.t<=0){jTip(b.next);J.shotTeam=b.next}}
  J.fx=J.fx.filter(f=>(f.t-=dt)>0);J.fx.forEach(f=>{f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=120*dt});
  if(J.clock<=0){J.clock=0;jOver()}
}
function jOver(){J.state="over";const w=J.score[0]>J.score[1],H=jLoad();H.g=(H.g||0)+1;if(w)H.w=(H.w||0)+1;H.best=Math.max(H.best||0,J.score[0]-J.score[1]);jSave(H);J.result=w?"YOU WIN":J.score[0]===J.score[1]?"TIE GAME":"YOU LOSE";jHud()}
const jLoad=()=>{try{return JSON.parse(localStorage.getItem("grindex-jam")||"{}")}catch(e){return {}}};
const jSave=o=>{try{localStorage.setItem("grindex-jam",JSON.stringify(o))}catch(e){}};

/* ---------- drawing (320x180, scaled up with crisp pixels) ---------- */
function jBg(){const c=document.createElement("canvas");c.width=JW;c.height=JH;const x=c.getContext("2d");
  x.fillStyle="#0d0f1a";x.fillRect(0,0,JW,JH);
  let sd=7;const r=()=>(sd=(sd*16807)%2147483647)/2147483647;   // crowd: seeded random pixels, rows of heads
  for(let row=0;row<7;row++)for(let i=0;i<JW;i+=3){if(r()<.25)continue;x.fillStyle=["#2a2f4a","#4a2f3a","#5a4a3a","#23324a","#3a4a3a","#6a5a4a"][(r()*6)|0];x.fillRect(i+((r()*2)|0),12+row*8+((r()*3)|0),2,3)}
  x.fillStyle="#191c2e";x.fillRect(0,68,JW,10);
  x.fillStyle="#c98a4b";x.fillRect(COURT.x0,COURT.y0,COURT.x1-COURT.x0,COURT.y1-COURT.y0);
  for(let y=COURT.y0;y<COURT.y1;y+=4){x.fillStyle=(y/4)%2?"#bd7f42":"#c98a4b";x.fillRect(COURT.x0,y,COURT.x1-COURT.x0,2)}
  x.strokeStyle="#f4ead8";x.lineWidth=1;x.strokeRect(COURT.x0+.5,COURT.y0+.5,COURT.x1-COURT.x0-1,COURT.y1-COURT.y0-1);
  x.beginPath();x.moveTo(160.5,COURT.y0);x.lineTo(160.5,COURT.y1);x.stroke();
  x.beginPath();x.ellipse(160.5,126,18,18*SQ,0,0,Math.PI*2);x.stroke();
  for(const [i,h] of HOOP.entries()){const lx=i?h.x-46:COURT.x0,lw=i?COURT.x1-lx:h.x+46-COURT.x0;   // the lane and the arc
    x.fillStyle=i?"rgba(63,127,232,.28)":"rgba(232,67,63,.28)";x.fillRect(lx,h.y-14,lw,28);x.strokeRect(lx+.5,h.y-13.5,lw-1,27);
    x.beginPath();x.ellipse(h.x,h.y,80,80*SQ,0,i?Math.PI/2:-Math.PI/2,i?Math.PI*1.5:Math.PI/2);x.stroke()}
  x.fillStyle="#ffd84a";x.font="bold 7px monospace";x.textAlign="center";x.fillText("GRINDEX JAM",160,76);
  return c}
function jDrawHoop(x,i,back){const h=HOOP[i],dir=i?1:-1,bx=h.x+dir*6;
  if(back){x.fillStyle="#555";x.fillRect(bx+dir*4-1,h.y-40,2,40);x.fillStyle="#e9eef7";x.fillRect(bx-1,h.y-52,3,22);x.fillStyle="#e8433f";x.fillRect(bx-1,h.y-44,3,6);return}
  x.fillStyle="#ff7a1a";x.fillRect(h.x-6,h.y-37,12,2);x.fillStyle="#f4f4f4";for(let k=0;k<5;k++)x.fillRect(h.x-5+k*2+(k%2),h.y-35,1,6-(k%2))}
function jDrawPlayer(x,p){
  const T=JTEAM[p.team],X=Math.round(p.x),Y=Math.round(p.y-p.z),run=Math.hypot(p.vx||0,p.vy||0)>5,leg=run?Math.round(Math.sin(p.anim*2))*1:0;
  x.fillStyle="rgba(0,0,0,.35)";x.beginPath();x.ellipse(X,Math.round(p.y),5,2,0,0,Math.PI*2);x.fill();
  if(J.fire[p.team]&&p===J.ball.own){x.fillStyle=["#ff8a2a","#ffd84a","#ff4a1a"][(J.t*12|0)%3];x.fillRect(X-4,Y-20,8,3)}
  x.fillStyle="#2b1d14";x.fillRect(X-3,Y-5,2,5+leg);x.fillRect(X+1,Y-5,2,5-leg);           // legs
  x.fillStyle=T.c;x.fillRect(X-4,Y-13,8,8);x.fillStyle=T.d;x.fillRect(X-4,Y-7,8,2);        // jersey and shorts band
  x.fillStyle=T.t;x.font="5px monospace";x.textAlign="center";x.fillText(p.num,X,Y-8);
  x.fillStyle="#8a5a3a";x.fillRect(X-2,Y-17,4,4);x.fillStyle="#1a1a1a";x.fillRect(X-2,Y-18,4,1);   // head
  const up=p.shoot||p.z>4;x.fillStyle="#8a5a3a";if(up){x.fillRect(X-5,Y-19,1,6);x.fillRect(X+4,Y-19,1,6)}else{x.fillRect(X-5,Y-12,1,5);x.fillRect(X+4,Y-12,1,5)}
  if(p.stun>0){x.fillStyle="#fff";x.fillRect(X-1,Y-23,1,1);x.fillRect(X+2,Y-22,1,1)}
  if(p===J.ctrl){x.fillStyle="#ffd84a";x.fillRect(X-2,Y-25,5,1);x.fillRect(X-1,Y-24,3,1);x.fillRect(X,Y-23,1,1)}
  if(p.shoot){const s=p.shoot,r=Math.min(1.45,s.t/s.dur),c=jContest(p),w=(s.dunk?.22:.12)*(1-.55*c)+(J.fire[p.team]?.05:0);
    const mx=X+8,my=Y-22,H=16;x.fillStyle="#000";x.fillRect(mx-1,my-1,5,H+2);x.fillStyle="#333";x.fillRect(mx,my,3,H);
    const gy=my+H-Math.round(H*(1+w)/1.45),gh=Math.max(1,Math.round(H*2*w/1.45));x.fillStyle="#3dd66b";x.fillRect(mx,gy,3,gh);
    x.fillStyle=r<1-w?"#ffd84a":r<=1+w?"#7dff8a":"#ff5a5a";const fh=Math.round(H*r/1.45);x.fillRect(mx,my+H-fh,3,1);x.fillRect(mx,my+H-fh,3,fh>0?Math.min(fh,2):0)}
}
function jDraw(){
  const x=J.ctx;x.save();if(J.shake)x.translate(rnd(-2,2)|0,rnd(-1,1)|0);
  x.drawImage(J.bg,0,0);jDrawHoop(x,0,true);jDrawHoop(x,1,true);
  const b=J.ball,items=J.p.map(p=>({y:p.y,f:()=>jDrawPlayer(x,p)}));
  const bp=b.st==="held"?{x:b.own.x+(b.own.team===0?4:-4),y:b.own.y+1,z:b.own.shoot||b.own.z>4?b.own.z+20:Math.abs(Math.sin(b.own.anim*1.6))*7+2}:b;
  if(bp&&bp.x!=null){items.push({y:bp.y+.5,f:()=>{const X=Math.round(bp.x),Y=Math.round(bp.y-(bp.z||0));x.fillStyle="rgba(0,0,0,.3)";x.fillRect(X-1,Math.round(bp.y),3,1);
    const on=J.fire[(b.own||{}).team]>0&&b.st!=="dead";if(on){x.fillStyle="#ff8a2a";x.fillRect(X-2,Y-2,5,5)}x.fillStyle="#ff7a1a";x.fillRect(X-1,Y-1,3,3);x.fillStyle="#7a2e00";x.fillRect(X,Y-1,1,3)}})}
  items.sort((a,b)=>a.y-b.y).forEach(i=>i.f());
  jDrawHoop(x,0,false);jDrawHoop(x,1,false);
  for(const f of J.fx){x.fillStyle=f.c;x.fillRect(f.x|0,f.y|0,2,2)}
  // scoreboard
  x.fillStyle="#000";x.fillRect(96,2,128,20);x.strokeStyle="#ffd84a";x.strokeRect(96.5,2.5,127,19);
  x.font="bold 7px monospace";x.textAlign="left";x.fillStyle=JTEAM[0].c;x.fillText(JTEAM[0].name,100,10);x.textAlign="right";x.fillStyle=JTEAM[1].c;x.fillText(JTEAM[1].name,220,10);
  x.textAlign="center";x.fillStyle="#fff";x.font="bold 9px monospace";x.fillText(`${J.score[0]}  ${J.score[1]}`,160,19);
  const m=Math.floor(J.clock/60),s=Math.floor(J.clock%60);x.font="7px monospace";x.fillStyle="#ffd84a";x.fillText(`${m}:${String(s).padStart(2,"0")}`,160,10);
  x.fillStyle="#000";x.fillRect(228,6,16,12);x.strokeStyle="#555";x.strokeRect(228.5,6.5,15,11);x.fillStyle=J.shot<4?"#ff5a5a":"#ffb84a";x.font="bold 8px monospace";x.fillText(String(Math.max(0,Math.ceil(J.shot))),236,15);
  // turbo
  const me=J.ctrl;x.fillStyle="#000";x.fillRect(6,170,52,6);x.fillStyle=me.turbo>.15?"#3dd6ff":"#ff5a5a";x.fillRect(7,171,Math.round(50*me.turbo),4);x.fillStyle="#fff";x.font="5px monospace";x.textAlign="left";x.fillText("TURBO",62,175);
  if(J.fire[0]){x.fillStyle="#ff8a2a";x.fillText("ON FIRE",96,175)}
  if(J.msgT>0&&J.msg&&J.msg.t){x.font="bold 11px monospace";x.textAlign="center";x.fillStyle="#000";x.fillText(J.msg.t,161,51);x.fillStyle=J.msg.c;x.fillText(J.msg.t,160,50)}
  x.restore();
  if(J.state!=="play"){x.fillStyle="rgba(0,0,0,.62)";x.fillRect(0,0,JW,JH);x.textAlign="center";x.fillStyle="#ffd84a";x.font="bold 14px monospace";
    const H=jLoad();
    if(J.state==="over"){x.fillText(J.result,160,74);x.font="bold 10px monospace";x.fillStyle="#fff";x.fillText(`${J.score[0]} - ${J.score[1]}`,160,92);x.font="7px monospace";x.fillStyle="#9aa";x.fillText(`Record ${H.w||0}-${(H.g||0)-(H.w||0)} · click to play again`,160,110)}
    else if(J.state==="paused"){x.fillText("PAUSED",160,82);x.font="7px monospace";x.fillStyle="#fff";x.fillText("Click to keep playing",160,98)}
    else{x.fillText("GRINDEX JAM",160,66);x.font="7px monospace";x.fillStyle="#fff";
      ["Click to start · 2 minutes · 2 on 2","WASD move · SHIFT turbo","HOLD mouse/SPACE, release at the top to shoot","SHIFT + shoot near the rim to dunk","RIGHT-CLICK/E pass, or steal on defense","Q switch player"].forEach((t,i)=>x.fillText(t,160,84+i*11));
      if(H.g){x.fillStyle="#9aa";x.fillText(`Your record ${H.w||0}-${H.g-(H.w||0)}`,160,156)}}}
}
function jHud(){jDraw()}
function jLoop(ts){J.raf=0;if(J.state!=="play")return;const dt=Math.min(.05,(ts-(J.last||ts))/1000);J.last=ts;J.t=(J.t||0)+dt;jStep(dt);jDraw();if(J.state==="play")J.raf=requestAnimationFrame(jLoop)}
function jGo(){if(J.state==="idle"||J.state==="over"){jNew()}J.state="play";J.last=0;J.cv.focus();if(!J.raf)J.raf=requestAnimationFrame(jLoop)}
function jPause(){if(J.state!=="play")return;J.state="paused";J.keys={};J.mouse=false;cancelAnimationFrame(J.raf);J.raf=0;jDraw()}

function renderHoops(){
  const el=$("#aHoops");if(!el)return;
  if(!matchMedia("(hover:hover) and (pointer:fine)").matches||innerWidth<900){el.hidden=true;return}   // desktop only
  if(el.dataset.ready)return;el.dataset.ready="1";
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Arcade · 2 on 2 · desktop</div><h2>Grindex Jam</h2></div></div>
    <canvas id="jamC" class="jamc" width="${JW}" height="${JH}" tabindex="0" aria-label="Grindex Jam, a 2 on 2 basketball game. Click to play."></canvas>
    <p class="faint jamhelp"><b>WASD</b> move · <b>Shift</b> turbo · <b>hold mouse / Space</b> shoot (let go at the top, in the green) or jump on D · <b>Shift + shoot</b> at the rim to dunk · <b>right-click / E</b> pass or steal · <b>Q</b> switch</p>`;
  J.cv=$("#jamC");J.ctx=J.cv.getContext("2d");J.ctx.imageSmoothingEnabled=false;J.bg=jBg();jNew();jDraw();
  J.cv.addEventListener("mousedown",e=>{e.preventDefault();if(J.state!=="play"){if(e.button===0)jGo();return}J.cv.focus();if(e.button===2)jAlt();else{J.mouse=true;J.mouseShot=false;jPress(true)}});
  addEventListener("mouseup",e=>{if(e.button!==0||!J.mouse)return;J.mouse=false;J.mouseShot=false;if(J.state==="play")jPress(false)});
  J.cv.addEventListener("contextmenu",e=>e.preventDefault());
  J.cv.addEventListener("blur",()=>jPause());
  document.addEventListener("visibilitychange",()=>{if(document.hidden)jPause()});
  new IntersectionObserver(es=>{if(!es[0].isIntersecting)jPause()},{threshold:.2}).observe(J.cv);
  jKeys(true);
}
renderHoops();
