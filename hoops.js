/* Grindex Jam: a small 2-on-2 arcade game in a 16-bit style, desktop only. First to 21 wins.
   You're red (Garebears), attacking the right hoop. WASD move, Shift turbo.
   Offense: hold the mouse (or Space) to rise into a jumper and let go at the top of the meter, in the green; the
            green window shrinks the closer a defender is. Shift + shoot near the rim dunks. Right-click / E passes,
            F calls a screen: your teammate picks off your defender and rolls to the rim.
   Defense: right-click / E swipes for a steal, hold the mouse / Space to jump: time it with the shot to block it.
            Q switches to your other player. The off-ball defenders help when someone drives past his man.
   Three makes in a row and you're on fire. The game only runs while you're playing it. */
const JW=320,JH=180,SC=2,SQ=.6,HOOP=[{x:26,y:126},{x:294,y:126}],COURT={x0:8,x1:312,y0:82,y1:174},WIN=21;
const JTEAM=[{name:"GAREBEARS",c:"#e8433f",l:"#ff7a6e",d:"#9e2420",t:"#ffe27a",skin:["#8a5a3a","#c58c5c"]},
             {name:"BOTS",c:"#3a78e6",l:"#77a8ff",d:"#1f3f8e",t:"#ffffff",skin:["#6b4a32","#d9a77a"]}];
const JDIFF={easy:{err:.16,stl:.14,blk:.13,spd:.92,win:1.3,help:.6},normal:{err:.1,stl:.22,blk:.22,spd:1,win:1,help:1},hard:{err:.05,stl:.32,blk:.32,spd:1.07,win:.82,help:1.3}};
let JD=JDIFF.easy;
const J={state:"idle",keys:{},mouse:false,raf:0,last:0,ctx:null,cv:null,bg:null,msg:null,msgT:0,fx:[],shake:0,t:0};
const jd=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)/SQ);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);

/* ---------- setup ---------- */
function jNew(){
  const P=(team,i,num)=>({team,i,num,x:0,y:0,z:0,vz:0,vx:0,vy:0,turbo:1,stun:0,cd:0,shoot:null,streak:0,anim:Math.random()*6,hold:0,screen:null,roll:0,swipe:0});
  J.p=[P(0,0,"23"),P(0,1,"7"),P(1,0,"11"),P(1,1,"3")];
  J.score=[0,0];J.fire=[0,0];J.fx=[];J.t=0;jTip(0);
}
function jMine(t){return J.p.filter(p=>p.team===t)}
function jMate(p){return J.p.find(x=>x.team===p.team&&x!==p)}
function jNearest(team,t){return jMine(team).sort((a,b)=>jd(a,t)-jd(b,t))[0]}
function jSay(t,c){J.msg={t,c:c||"#ffe27a"};J.msgT=1.4}
function jTip(team){   // team takes it out at its own end and brings it up
  const own=HOOP[team===0?0:1],dir=team===0?1:-1;
  J.p.forEach(p=>{const mine=p.team===team,k=p.i;
    p.x=own.x+dir*(mine?(k?64:34):(k?100:74));p.y=own.y+(k?26:-20)*(mine?1:-1);p.z=p.vz=0;p.shoot=null;p.stun=0;p.screen=null;p.roll=0});
  const h=jMine(team)[0];J.ball={st:"held",own:h};h.hold=.5;
  J.ctrl=team===0?h:jNearest(0,h);
}

/* ---------- input ---------- */
function jKeys(){
  addEventListener("keydown",e=>{if(J.state!=="play"||document.activeElement!==J.cv)return;
    const k=e.key.toLowerCase();if(["w","a","s","d","shift"," ","e","q","f"].includes(k))e.preventDefault();
    if(J.keys[k])return;J.keys[k]=true;
    if(k===" ")jPress(true);if(k==="e")jAlt();if(k==="q")jSwitch();if(k==="f")jCallScreen(J.ctrl)});
  addEventListener("keyup",e=>{const k=e.key.toLowerCase();J.keys[k]=false;if(k===" ")jPress(false)});
}
function jOffense(){return J.ball.st==="held"&&J.ball.own&&J.ball.own.team===0}
function jPress(down){
  if(J.state!=="play")return;const me=J.ctrl;
  if(down){if(J.ball.st==="held"&&J.ball.own===me)jStartShot(me,!!J.keys.shift);else if(me.z===0&&me.stun<=0)me.vz=165}
  else if(me.shoot)jRelease(me);
}
function jAlt(){if(J.state!=="play")return;const me=J.ctrl;
  if(J.ball.st==="held"&&J.ball.own===me){if(!me.shoot)jPass(me)}
  else if(!jOffense())jSteal(me)}
function jSwitch(){if(jOffense())return;J.ctrl=jMate(J.ctrl)}

/* ---------- basketball ---------- */
function jContest(s){let c=0;for(const d of J.p){if(d.team===s.team||d.stun>0)continue;c=Math.max(c,clamp((24-jd(d,s))/18,0,1)*(d.z>3?1:.6))}return c}
function jStartShot(p,turbo){
  if(p.shoot||p.stun>0)return;const dd=jd(p,HOOP[p.team===0?1:0]),dunk=dd<32&&turbo&&p.turbo>.15;
  p.shoot={t:0,dur:dunk?.32:.5,dunk,c:jContest(p),ai:1+(Math.random()-.5)*2*JD.err};p.vz=dunk?220:150;if(dunk)p.turbo=Math.max(0,p.turbo-.3);
}
function jBlock(d,x,y,z){const r=d===J.ctrl?.6:JD.blk;if(Math.random()>r)return false;
  jSay(d.team===0?"REJECTED!":"BLOCKED","#ff6b6b");J.shake=.3;J.ball={st:"loose",x,y,z,vx:rnd(-70,70),vy:rnd(-35,35),vz:70,ignore:.12};jFx(x,y-z,"#fff",10);return true}
function jRelease(p,auto){
  const s=p.shoot;if(!s)return;p.shoot=null;
  const h=HOOP[p.team===0?1:0],dd=jd(p,h),c=Math.max(s.c,jContest(p)),fire=J.fire[p.team]>0;
  const r=s.t/s.dur,e=Math.abs(r-1),w=jWin(p,s,c,dd);
  const grade=auto?"late":e<w*.35?"perfect":e<w?"good":r<1?"early":"late";
  for(const d of J.p)if(d.team!==p.team&&d.z>12&&jd(d,p)<12&&jBlock(d,p.x,p.y,p.z+16))return;   // you have to be up in his face, near the top of your jump
  // past the arc it gets harder fast: a perfect release from half court is a coin flip, from full court a prayer
  const far=clamp((dd-82)/180,0,1),base=s.dunk?.88:dd<34?.78:dd<82?.6:Math.max(.04,.48-.44*far);
  let pm=grade==="perfect"?Math.min(.98,base+.38*(1-.8*far)):grade==="good"?base+.08*(1-far):base*.25;
  pm=clamp(pm-c*(s.dunk?.25:.3)+(fire?.15:0),.02,.98);
  J.ball={st:"shot",own:p,sx:p.x,sy:p.y,sz:p.z+18,t:0,dur:s.dunk?.18:clamp(.45+dd/300,.5,1),make:Math.random()<pm,pts:dd>82?3:2,h,dunk:s.dunk,tried:new Set()};
  if(p.team===0)jSay(grade==="perfect"?"PERFECT":grade==="good"?"GOOD":grade==="early"?"EARLY":"LATE",grade==="perfect"?"#7dff8a":grade==="good"?"#ffe27a":"#ff8a6b");
}
function jWin(p,s,c,dd){   // half-width of the green window (in meter fractions)
  let w=(s.dunk?.22:.13)*(1-.55*c)*clamp(1-(dd-82)/260,.45,1)+(J.fire[p.team]?.05:0);if(p===J.ctrl)w*=JD.win;return w}
function jPass(p){const to=jMate(p);J.ball={st:"pass",own:p,to,sx:p.x,sy:p.y,t:0,dur:clamp(jd(p,to)/280,.16,.45)};p.hold=0;
  for(const d of J.p)if(d.team!==p.team&&d.stun<=0){const L=Math.max(1,(to.x-p.x)**2+(to.y-p.y)**2),t=((d.x-p.x)*(to.x-p.x)+(d.y-p.y)*(to.y-p.y))/L;
    if(t>.2&&t<.85&&jd(d,{x:p.x+(to.x-p.x)*t,y:p.y+(to.y-p.y)*t})<7&&Math.random()<.5){J.ball.picked=d;J.ball.dur*=t;break}}}
function jSteal(p){if(p.cd>0||p.stun>0)return;p.cd=.6;p.swipe=.25;const h=J.ball.own;if(J.ball.st!=="held"||!h||h.team===p.team||jd(p,h)>16)return;
  const moving=Math.hypot(h.vx,h.vy)>10;const ch=(p===J.ctrl?.42:JD.stl)+(moving?0:.15)-(h.shoot?.15:0);
  if(Math.random()<ch){jGive(p);jSay(p.team===0?"STOLEN!":"PICKED","#7dff8a");jFx(p.x,p.y-18,"#ffe27a",8)}else p.stun=.25}
function jGive(p){const flip=J.ball.own&&J.ball.own.team!==p.team;J.ball={st:"held",own:p};p.hold=.35;
  if(p.team===0)J.ctrl=p;else if(flip||J.ctrl.team!==0)J.ctrl=jNearest(0,p)}
function jCallScreen(me){   // your teammate sets a pick on the man guarding you, then rolls to the rim
  if(J.ball.st!=="held"||J.ball.own!==me)return;const m=jMate(me),d=jNearest(1-me.team,me);if(m.screen||m.roll>0)return;
  m.screen={d,t:2.6};if(me.team===0)jSay("SCREEN!","#9fd0ff")}
function jScore(b){const t=b.own.team;J.score[t]+=b.pts;
  const s=b.own;s.streak++;jMine(1-t).forEach(x=>x.streak=0);J.fire[1-t]=0;
  if(s.streak>=3&&!J.fire[t]){J.fire[t]=3;jSay(t===0?"HE'S ON FIRE!":"THEY'RE HEATING UP","#ff8a2a")}else if(J.fire[t])J.fire[t]--;
  if(!J.msgT||J.msgT<.6)jSay(b.dunk?"BOOMSHAKALAKA!":b.pts===3?"FROM DOWNTOWN!":"",b.dunk?"#ffe27a":"#fff");
  J.shake=b.dunk?.35:.12;jFx(b.h.x,b.h.y-40,J.fire[t]?"#ff8a2a":"#fff",12);
  if(J.score[t]>=WIN){J.ball={st:"dead",t:1.2,next:-1,x:b.h.x,y:b.h.y,z:24};return}
  J.ball={st:"dead",t:.9,next:1-t,x:b.h.x,y:b.h.y,z:24}}
function jFx(x,y,c,n=6){for(let i=0;i<n;i++)J.fx.push({x,y,vx:rnd(-45,45),vy:rnd(-55,10),t:rnd(.3,.65),c})}

/* ---------- AI ---------- */
function jAI(p,dt){
  const b=J.ball,att=HOOP[p.team===0?1:0],def=HOOP[p.team===0?0:1];let tx=p.x,ty=p.y,turbo=false;
  if(b.st==="held"&&b.own.team===p.team){
    if(b.own===p){                                 // ball handler: attack, share it, shoot when open
      const dd=jd(p,att),c=jContest(p),m=jMate(p),mc=jContest(m),mdd=jd(m,att);
      tx=att.x+(p.team===0?-22:22);ty=att.y+Math.sin(p.anim*.5+p.i*2)*26;turbo=dd<75&&p.turbo>.4;
      if(!p.shoot){
        if(p.hold<=0&&mc<.35&&(c>.45||m.roll>0||mdd<dd-15||Math.random()<dt*.7)&&Math.random()<dt*3.2)jPass(p);
        else if((dd<34&&c<.7)||(dd<84&&c<.3&&Math.random()<dt*2))jStartShot(p,turbo);
        else if(p.team===1&&c>.5&&!m.screen&&m.roll<=0&&Math.random()<dt*.5)jCallScreen(p)}
      else if(p.shoot.t>=p.shoot.dur*p.shoot.ai)jRelease(p);
    }else if(p.screen){const d=p.screen.d,h=b.own;tx=d.x+(d.x-h.x)*.35;ty=d.y+(d.y-h.y)*.35;turbo=true}
    else if(p.roll>0){tx=att.x+(p.team===0?-14:14);ty=att.y+8;turbo=true}
    else{tx=att.x+(p.team===0?-66:66);ty=b.own.y>126?100:152;if(jContest(p)<.2&&Math.random()<dt*.25)p.roll=1}   // spot up, sometimes cut
  }else if(b.st==="held"){                         // defense: guard your man, help when someone gets beat
    const h=b.own,them=jMine(1-p.team),man=them[p.i],onBall=man===h,mate=jMate(p);
    const beaten=jd(h,def)<jd(mate,def)-6||jd(h,def)<46;
    if(onBall){tx=man.x+(def.x-man.x)*.22;ty=man.y+(def.y-man.y)*.22;turbo=jd(p,man)>26;
      if(jd(p,man)<15&&p.cd<=0&&Math.random()<dt*1.1)jSteal(p)}
    else if(beaten&&(p.team===0||Math.random()<JD.help||p.helping)){p.helping=true;tx=h.x+(def.x-h.x)*.4;ty=h.y+(def.y-h.y)*.4;turbo=true}   // help: step into the driving lane
    else{p.helping=false;tx=man.x+(def.x-man.x)*.42+(h.x-man.x)*.15;ty=man.y+(def.y-man.y)*.42;turbo=jd(p,man)>34}
    if(h.shoot&&jd(p,h)<22&&p.z===0&&Math.random()<dt*4)p.vz=150;
  }else if(b.st==="loose"||b.st==="shot"){const g=b.st==="loose"?b:b.h;tx=g.x+(b.st==="shot"?(p.i?9:-9):0);ty=g.y+(b.st==="shot"?(p.i?7:-7):0);turbo=true}
  jMove(p,tx-p.x,ty-p.y,turbo,dt,true);
}
function jMove(p,dx,dy,turbo,dt,ai){
  const n=Math.hypot(dx,dy/SQ);if((ai&&n<3)||p.stun>0||p.shoot){p.vx=p.vy=0;return}
  const has=J.ball.st==="held"&&J.ball.own===p,sp=(turbo&&p.turbo>.05?94:60)*(has?.9:1)*(ai&&p.team===1?JD.spd:1);
  if(turbo&&n>0)p.turbo=Math.max(0,p.turbo-dt*.45);
  p.vx=n?dx/n*sp:0;p.vy=n?dy/n*sp:0;p.x=clamp(p.x+p.vx*dt,COURT.x0+4,COURT.x1-4);p.y=clamp(p.y+p.vy*dt,COURT.y0+4,COURT.y1-2);
}

/* ---------- step ---------- */
function jStep(dt){
  J.t+=dt;J.msgT=Math.max(0,J.msgT-dt);J.shake=Math.max(0,J.shake-dt);
  const b=J.ball,me=J.ctrl;
  const dx=(J.keys.d?1:0)-(J.keys.a?1:0),dy=(J.keys.s?1:0)-(J.keys.w?1:0);
  jMove(me,dx,dy*SQ,!!J.keys.shift,dt,false);
  for(const p of J.p){if(p!==me)jAI(p,dt);
    p.anim+=dt*(Math.hypot(p.vx,p.vy)>5?9:3);p.cd=Math.max(0,p.cd-dt);p.stun=Math.max(0,p.stun-dt);p.hold=Math.max(0,p.hold-dt);p.swipe=Math.max(0,p.swipe-dt);p.roll=Math.max(0,p.roll-dt);
    if(!(p===me&&J.keys.shift))p.turbo=Math.min(1,p.turbo+dt*.18);
    if(p.vz||p.z>0){p.z+=p.vz*dt;p.vz-=430*dt;if(p.z<=0){p.z=0;p.vz=0}}
    if(p.shoot){p.shoot.t+=dt;if(p.shoot.t>p.shoot.dur*1.45)jRelease(p,true)}
    if(p.screen){p.screen.t-=dt;const d=p.screen.d;
      if(jd(p,d)<8&&d.stun<=0){d.stun=1;p.screen=null;p.roll=1.6;jSay(p.team===0?"PICKED HIM OFF":"SCREENED","#9fd0ff");jFx(d.x,d.y-16,"#9fd0ff",5)}
      else if(p.screen.t<=0)p.screen=null}}
  if(J.ball!==b)return;
  if(b.st==="held"){b.x=b.own.x;b.y=b.own.y}
  else if(b.st==="pass"){b.t+=dt;const k=b.t/b.dur,to=b.picked||b.to;b.x=b.sx+(to.x-b.sx)*k;b.y=b.sy+(to.y-b.sy)*k;b.z=13+Math.sin(k*Math.PI)*8;
    if(k>=1){if(b.picked){jGive(b.picked);jSay(b.picked.team===0?"PICKED OFF!":"INTERCEPTED","#7dff8a")}else jGive(b.to)}}
  else if(b.st==="shot"){b.t+=dt;const k=Math.min(1,b.t/b.dur),hz=38;
    b.x=b.sx+(b.h.x-b.sx)*k;b.y=b.sy+(b.h.y-b.sy)*k;b.z=b.sz+(hz-b.sz)*k+Math.sin(k*Math.PI)*(b.dunk?6:24+jd({x:b.sx,y:b.sy},b.h)*.12);
    // on the way up the ball can still be swatted by a defender who's in the air next to it
    if(k<.22&&!b.dunk)for(const d of J.p)if(d.team!==b.own.team&&d.z>12&&!b.tried.has(d)&&jd(d,b)<12&&d.z+30>=b.z){b.tried.add(d);if(jBlock(d,b.x,b.y,b.z))return}
    if(k>=1){if(b.make)jScore(b);else{J.ball={st:"loose",x:b.h.x,y:b.h.y,z:hz,vx:(b.h.x<160?1:-1)*rnd(20,70),vy:rnd(-40,40),vz:rnd(30,80),ignore:.15};
      if(b.own.team===0)jSay("CLANK","#ff8a6b");b.own.streak=0}}}
  else if(b.st==="loose"){b.ignore=Math.max(0,(b.ignore||0)-dt);b.x=clamp(b.x+b.vx*dt,COURT.x0,COURT.x1);b.y=clamp(b.y+b.vy*dt,COURT.y0,COURT.y1);b.z+=b.vz*dt;b.vz-=300*dt;
    if(b.z<=0){b.z=0;b.vz=Math.abs(b.vz)*.45;b.vx*=.7;b.vy*=.7}
    if(!b.ignore)for(const p of J.p)if(jd(p,b)<10&&b.z<p.z+26){jGive(p);break}}
  else if(b.st==="dead"){b.t-=dt;b.z=Math.max(0,b.z-dt*40);if(b.t<=0){if(b.next<0)jOver();else jTip(b.next)}}
  J.fx=J.fx.filter(f=>(f.t-=dt)>0);J.fx.forEach(f=>{f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=120*dt});
}
function jOver(){J.state="over";const w=J.score[0]>J.score[1],H=jLoad();H.g=(H.g||0)+1;if(w)H.w=(H.w||0)+1;jSave(H);J.result=w?"YOU WIN":"YOU LOSE";jDraw()}
const jLoad=()=>{try{return JSON.parse(localStorage.getItem("grindex-jam")||"{}")}catch(e){return {}}};
const jSave=o=>{try{localStorage.setItem("grindex-jam",JSON.stringify(o))}catch(e){}};

/* ---------- drawing: 320x180 game units on a 640x360 canvas, so sprites get half-pixel detail ---------- */
function jBg(){const c=document.createElement("canvas");c.width=JW*SC;c.height=JH*SC;const x=c.getContext("2d");x.scale(SC,SC);
  let sd=11;const r=()=>(sd=(sd*16807)%2147483647)/2147483647;
  const sky=x.createLinearGradient(0,0,0,80);sky.addColorStop(0,"#07081a");sky.addColorStop(1,"#1b1640");x.fillStyle=sky;x.fillRect(0,0,JW,80);
  for(let row=0;row<8;row++)for(let i=0;i<JW;i+=3.5){if(r()<.18)continue;const X=i+r(),Y=14+row*7.2+r()*1.5,sh=["#c0392b","#2e86de","#f1c40f","#27ae60","#8e44ad","#e67e22","#ecf0f1","#34495e"][(r()*8)|0];
    x.globalAlpha=.35+row*.07;x.fillStyle=sh;x.fillRect(X,Y+2,2.5,3);x.fillStyle=["#3b2416","#8a5a3a","#c58c5c","#e0b48a"][(r()*4)|0];x.fillRect(X+.5,Y,1.5,1.8)}
  x.globalAlpha=1;
  for(const sx of [70,250]){const g=x.createRadialGradient(sx,0,2,sx,40,90);g.addColorStop(0,"rgba(255,240,200,.18)");g.addColorStop(1,"rgba(255,240,200,0)");x.fillStyle=g;x.fillRect(0,0,JW,90)}
  const ad=x.createLinearGradient(0,72,0,82);ad.addColorStop(0,"#1a2a6c");ad.addColorStop(1,"#0d1440");x.fillStyle=ad;x.fillRect(0,72,JW,10);
  x.font="bold 5px monospace";x.textAlign="center";for(let i=0;i<5;i++){x.fillStyle=i%2?"#ffe27a":"#7fd3ff";x.fillText(i%2?"GRINDEX":"FANTASY HOOPS",32+i*64,79)}
  const wood=x.createLinearGradient(0,COURT.y0,0,COURT.y1);wood.addColorStop(0,"#b8763c");wood.addColorStop(.5,"#d39552");wood.addColorStop(1,"#c4813f");
  x.fillStyle=wood;x.fillRect(0,82,JW,JH-82);
  for(let y=82;y<JH;y+=3){x.fillStyle=`rgba(90,45,10,${.08+((y/3)%3)*.04})`;x.fillRect(0,y,JW,.5)}
  for(let i=0;i<60;i++){x.fillStyle="rgba(90,45,10,.18)";x.fillRect(r()*JW,82+((r()*30)|0)*3,.5,3)}
  const gl=x.createLinearGradient(0,82,0,130);gl.addColorStop(0,"rgba(255,255,255,.10)");gl.addColorStop(1,"rgba(255,255,255,0)");x.fillStyle=gl;x.fillRect(0,82,JW,48);
  x.strokeStyle="#fbf3e2";x.lineWidth=1;x.strokeRect(COURT.x0+.5,COURT.y0+.5,COURT.x1-COURT.x0-1,COURT.y1-COURT.y0-1);
  x.beginPath();x.moveTo(160,COURT.y0);x.lineTo(160,COURT.y1);x.stroke();
  x.fillStyle="rgba(232,67,63,.35)";x.beginPath();x.ellipse(160,128,20,20*SQ,0,0,Math.PI*2);x.fill();x.stroke();
  x.fillStyle="#ffe27a";x.font="bold 9px monospace";x.fillText("G",160,131);
  for(const [i,h] of HOOP.entries()){const lx=i?h.x-46:COURT.x0,lw=i?COURT.x1-lx:h.x+46-COURT.x0;
    x.fillStyle=i?"rgba(58,120,230,.42)":"rgba(232,67,63,.42)";x.fillRect(lx,h.y-15,lw,30);x.strokeRect(lx+.5,h.y-14.5,lw-1,29);
    x.beginPath();x.ellipse(h.x+(i?-46:46),h.y,10,10*SQ,0,i?Math.PI/2:-Math.PI/2,i?Math.PI*1.5:Math.PI/2);x.stroke();
    x.beginPath();x.ellipse(h.x,h.y,82,82*SQ,0,i?Math.PI/2:-Math.PI/2,i?Math.PI*1.5:Math.PI/2);x.stroke()}
  const vg=x.createRadialGradient(160,120,60,160,120,220);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.35)");x.fillStyle=vg;x.fillRect(0,0,JW,JH);
  return c}
function jDrawHoop(x,i,front){const h=HOOP[i],dir=i?1:-1,bx=h.x+dir*7;
  if(!front){x.fillStyle="#2b2f3a";x.fillRect(bx+dir*6-1.5,h.y-46,3,46);x.fillStyle="#1b5e9e";x.fillRect(bx+dir*6-3,h.y-4,6,4);
    x.fillStyle="rgba(200,230,255,.35)";x.fillRect(bx-1.5,h.y-58,3,24);x.fillStyle="#fff";x.fillRect(bx-1.5,h.y-58,3,1);x.fillRect(bx-1.5,h.y-35,3,1);
    x.strokeStyle="#ff5a3a";x.lineWidth=.5;x.strokeRect(bx-1,h.y-49,2,7);return}
  x.strokeStyle="#ff7a1a";x.lineWidth=1.2;x.beginPath();x.ellipse(h.x,h.y-39,6,2,0,0,Math.PI*2);x.stroke();
  x.strokeStyle="rgba(255,255,255,.85)";x.lineWidth=.5;for(let k=-5;k<=5;k+=2.5){x.beginPath();x.moveTo(h.x+k,h.y-38);x.lineTo(h.x+k*.55+(k>0?-1:1),h.y-31);x.stroke()}
  x.beginPath();x.moveTo(h.x-4,h.y-34);x.lineTo(h.x+4,h.y-34);x.stroke()}
function jDrawPlayer(x,p){
  const T=JTEAM[p.team],X=p.x,Y=p.y-p.z,run=Math.hypot(p.vx,p.vy)>5,sw=run?Math.sin(p.anim):0,face=p.vx<-5?-1:p.vx>5?1:(p.team===0?1:-1);
  x.fillStyle="rgba(0,0,0,.35)";x.beginPath();x.ellipse(X,p.y,6.5-Math.min(3,p.z/12),2.2,0,0,Math.PI*2);x.fill();
  if(p.roll>0||p.screen){x.strokeStyle="rgba(159,208,255,.7)";x.lineWidth=.6;x.beginPath();x.ellipse(X,p.y,8,3,0,0,Math.PI*2);x.stroke()}
  const skin=T.skin[p.i];
  x.fillStyle="#fff";x.fillRect(X-3.5,Y-1.5+sw*.6,3,1.5);x.fillRect(X+.5,Y-1.5-sw*.6,3,1.5);
  x.fillStyle="#e8e8e8";x.fillRect(X-3,Y-3.5+sw*.6,2,2);x.fillRect(X+1,Y-3.5-sw*.6,2,2);
  x.fillStyle=skin;x.fillRect(X-3,Y-8+sw*.4,2,4.5);x.fillRect(X+1,Y-8-sw*.4,2,4.5);
  x.fillStyle=T.c;x.fillRect(X-4,Y-11,8,4);x.fillStyle=T.d;x.fillRect(X-4,Y-11,8,.8);x.fillRect(X-.3,Y-10.5,.6,3.5);
  x.fillStyle=T.c;x.fillRect(X-4,Y-18.5,8,7.8);x.fillStyle=T.l;x.fillRect(X-4,Y-18.5,2,7.8);x.fillStyle=T.d;x.fillRect(X+2.5,Y-18.5,1.5,7.8);
  x.fillStyle=T.t;x.font="bold 4.5px monospace";x.textAlign="center";x.fillText(p.num,X+.3,Y-12.6);
  const up=p.shoot||p.z>5,reach=p.swipe>0;x.fillStyle=skin;
  if(up){x.fillRect(X-5.2,Y-25,1.6,7);x.fillRect(X+3.6,Y-25,1.6,7)}
  else if(reach){x.fillRect(face>0?X+3.6:X-9.1,Y-16,5.5,1.6);x.fillRect(face>0?X-5.2:X+3.6,Y-18,1.6,5)}
  else{x.fillRect(X-5.4,Y-18,1.6,6+sw*.5);x.fillRect(X+3.8,Y-18,1.6,6-sw*.5)}
  x.fillRect(X-2.5,Y-24,5,5.5);x.fillStyle="#1d130c";x.fillRect(X-2.5,Y-24.5,5,1.6);x.fillStyle=T.c;x.fillRect(X-2.6,Y-22.8,5.2,.8);
  x.fillStyle="#000";x.fillRect(X+(face>0?.8:-1.6),Y-21.6,.8,.8);
  if(p.stun>0){x.fillStyle="#ffe27a";const a=J.t*8;x.fillRect(X+Math.cos(a)*4,Y-28+Math.sin(a)*1.2,1,1);x.fillRect(X-Math.cos(a)*4,Y-28-Math.sin(a)*1.2,1,1)}
  if(p===J.ctrl){x.fillStyle="#ffe27a";x.beginPath();x.moveTo(X-2.5,Y-32);x.lineTo(X+2.5,Y-32);x.lineTo(X,Y-29);x.fill()}
  if(p.shoot){const s=p.shoot,r=Math.min(1.45,s.t/s.dur),c=jContest(p),w=jWin(p,s,c,jd(p,HOOP[p.team===0?1:0]));
    const mx=X+8,my=Y-30,H=20;x.fillStyle="#000";x.fillRect(mx-1,my-1,5,H+2);x.fillStyle="#2a2a35";x.fillRect(mx,my,3,H);
    const g0=my+H-H*(1+w)/1.45;x.fillStyle="#3dd66b";x.fillRect(mx,g0,3,H*2*w/1.45);
    x.fillStyle=r<1-w?"#ffe27a":r<=1+w?"#7dff8a":"#ff5a5a";const fh=H*r/1.45;x.fillRect(mx,my+H-fh,3,fh);x.fillStyle="#fff";x.fillRect(mx-1,my+H-fh,5,.7)}
}
function jDrawBall(x,b){
  const bp=b.st==="held"?{x:b.own.x+(b.own.team===0?4.5:-4.5),y:b.own.y+1,z:b.own.shoot||b.own.z>5?b.own.z+24:Math.abs(Math.sin(b.own.anim*.9))*8+2}:b;
  if(bp.x==null)return null;
  return {y:bp.y+.5,f:()=>{const X=bp.x,Y=bp.y-(bp.z||0),on=J.fire[(b.own||{}).team]>0&&b.st!=="dead";
    x.fillStyle="rgba(0,0,0,.3)";x.beginPath();x.ellipse(X,bp.y,2,.8,0,0,Math.PI*2);x.fill();
    if(on){x.fillStyle=["#ff8a2a","#ffe27a","#ff4a1a"][(J.t*14|0)%3];x.beginPath();x.arc(X,Y-1,3.6,0,Math.PI*2);x.fill()}
    const g=x.createRadialGradient(X-.8,Y-.8,.3,X,Y,2.4);g.addColorStop(0,"#ffb070");g.addColorStop(1,"#c2410c");x.fillStyle=g;x.beginPath();x.arc(X,Y,2.3,0,Math.PI*2);x.fill();
    x.strokeStyle="rgba(60,20,0,.7)";x.lineWidth=.35;x.beginPath();x.moveTo(X-2.2,Y);x.lineTo(X+2.2,Y);x.moveTo(X,Y-2.2);x.lineTo(X,Y+2.2);x.stroke()}};
}
function jDraw(){
  const x=J.ctx;x.setTransform(SC,0,0,SC,0,0);x.save();if(J.shake)x.translate(rnd(-1.5,1.5),rnd(-1,1));
  x.drawImage(J.bg,0,0,JW,JH);jDrawHoop(x,0,false);jDrawHoop(x,1,false);
  const items=J.p.map(p=>({y:p.y,f:()=>jDrawPlayer(x,p)}));const bi=jDrawBall(x,J.ball);if(bi)items.push(bi);
  items.sort((a,b)=>a.y-b.y).forEach(i=>i.f());jDrawHoop(x,0,true);jDrawHoop(x,1,true);
  for(const f of J.fx){x.globalAlpha=Math.min(1,f.t*3);x.fillStyle=f.c;x.fillRect(f.x,f.y,1.5,1.5)}x.globalAlpha=1;
  x.restore();
  const sb=x.createLinearGradient(0,3,0,25);sb.addColorStop(0,"#1c1f33");sb.addColorStop(1,"#07080f");x.fillStyle=sb;x.fillRect(100,3,120,22);
  x.strokeStyle="#ffe27a";x.lineWidth=.8;x.strokeRect(100.5,3.5,119,21);
  x.font="bold 6px monospace";x.textAlign="left";x.fillStyle=JTEAM[0].l;x.fillText(JTEAM[0].name,105,11);x.textAlign="right";x.fillStyle=JTEAM[1].l;x.fillText(JTEAM[1].name,215,11);
  x.textAlign="center";x.font="bold 10px monospace";x.fillStyle="#fff";x.fillText(String(J.score[0]),128,22);x.fillText(String(J.score[1]),192,22);
  x.font="bold 5px monospace";x.fillStyle="#ffe27a";x.fillText(`TO ${WIN} · ${Object.keys(JDIFF).find(k=>JDIFF[k]===JD).toUpperCase()}`,160,20);
  const me=J.ctrl;x.fillStyle="rgba(0,0,0,.6)";x.fillRect(8,168,56,7);x.fillStyle=me.turbo>.15?"#3dd6ff":"#ff5a5a";x.fillRect(9,169,54*me.turbo,5);
  x.fillStyle="#fff";x.font="bold 4.5px monospace";x.textAlign="left";x.fillText("TURBO",66,173.5);
  x.textAlign="right";x.fillStyle="rgba(255,255,255,.75)";x.fillText(jOffense()?"F screen · E pass":"E steal · SPACE block · Q switch",312,173.5);
  if(J.fire[0]){x.textAlign="left";x.fillStyle="#ff8a2a";x.fillText("ON FIRE",92,173.5)}
  if(J.msgT>0&&J.msg&&J.msg.t){x.font="bold 12px monospace";x.textAlign="center";x.fillStyle="rgba(0,0,0,.7)";x.fillText(J.msg.t,161,56);x.fillStyle=J.msg.c;x.fillText(J.msg.t,160,55)}
  if(J.state!=="play"){x.fillStyle="rgba(5,6,16,.72)";x.fillRect(0,0,JW,JH);x.textAlign="center";x.fillStyle="#ffe27a";x.font="bold 16px monospace";const H=jLoad();
    if(J.state==="over"){x.fillText(J.result,160,76);x.font="bold 11px monospace";x.fillStyle="#fff";x.fillText(`${J.score[0]} - ${J.score[1]}`,160,94);x.font="6px monospace";x.fillStyle="#aab";x.fillText(`Record ${H.w||0}-${(H.g||0)-(H.w||0)} · click to play again`,160,112)}
    else if(J.state==="paused"){x.fillText("PAUSED",160,84);x.font="6px monospace";x.fillStyle="#fff";x.fillText("Click to keep playing",160,100)}
    else{x.fillText("GRINDEX JAM",160,58);x.font="6px monospace";x.fillStyle="#fff";
      [`Click to start · 2 on 2 · first to 21 · ${Object.keys(JDIFF).find(k=>JDIFF[k]===JD)}`,"WASD move · SHIFT turbo","HOLD mouse/SPACE, let go at the top of the meter to shoot","SHIFT + shoot at the rim to dunk","E / right-click: pass, or steal on defense","F: call a screen · SPACE on defense: jump to block · Q: switch"].forEach((t,i)=>x.fillText(t,160,76+i*11));
      if(H.g){x.fillStyle="#aab";x.fillText(`Your record ${H.w||0}-${H.g-(H.w||0)}`,160,150)}}}
}
function jLoop(ts){J.raf=0;if(J.state!=="play")return;const dt=Math.min(.05,(ts-(J.last||ts))/1000);J.last=ts;jStep(dt);jDraw();if(J.state==="play")J.raf=requestAnimationFrame(jLoop)}
function jGo(){if(J.state==="idle"||J.state==="over")jNew();J.state="play";J.last=0;J.cv.focus();if(!J.raf)J.raf=requestAnimationFrame(jLoop)}
function jPause(){if(J.state!=="play")return;J.state="paused";J.keys={};J.mouse=false;cancelAnimationFrame(J.raf);J.raf=0;jDraw()}

function renderHoops(){
  const el=$("#aHoops");if(!el)return;
  if(!matchMedia("(hover:hover) and (pointer:fine)").matches||innerWidth<900){el.hidden=true;return}   // desktop only
  if(el.dataset.ready)return;el.dataset.ready="1";
  let dv="easy";try{dv=localStorage.getItem("grindex-jam-diff")||"easy"}catch(e){}JD=JDIFF[dv]||JDIFF.easy;
  el.innerHTML=`<div class="sec-h"><div><div class="eyebrow">Arcade · 2 on 2 · first to ${WIN}</div><h2>Grindex Jam</h2></div>
      <div class="hgmodes" role="group" aria-label="Difficulty">${["easy","normal","hard"].map(k=>`<button type="button" class="hgm ${k===dv?"on":""}" data-jd="${k}">${k[0].toUpperCase()+k.slice(1)}</button>`).join("")}</div></div>
    <canvas id="jamC" class="jamc" width="${JW*SC}" height="${JH*SC}" tabindex="0" aria-label="Grindex Jam, a 2 on 2 basketball game. Click to play."></canvas>
    <p class="faint jamhelp"><b>WASD</b> move · <b>Shift</b> turbo · <b>hold mouse / Space</b> shoot (let go at the top, in the green) · <b>Shift + shoot</b> at the rim to dunk · <b>right-click / E</b> pass · <b>F</b> call a screen<br>
      Defense: <b>right-click / E</b> steal · <b>mouse / Space</b> jump to block (time it with the shot) · <b>Q</b> switch players</p>`;
  el.querySelectorAll("[data-jd]").forEach(b=>b.onclick=()=>{JD=JDIFF[b.dataset.jd];try{localStorage.setItem("grindex-jam-diff",b.dataset.jd)}catch(e){}
    el.querySelectorAll("[data-jd]").forEach(x=>x.classList.toggle("on",x===b));J.state="idle";cancelAnimationFrame(J.raf);J.raf=0;jNew();jDraw()});
  J.cv=$("#jamC");J.ctx=J.cv.getContext("2d");J.ctx.imageSmoothingEnabled=false;J.bg=jBg();jNew();jDraw();
  J.cv.addEventListener("mousedown",e=>{e.preventDefault();if(J.state!=="play"){if(e.button===0)jGo();return}J.cv.focus();if(e.button===2)jAlt();else if(e.button===0){J.mouse=true;jPress(true)}});
  addEventListener("mouseup",e=>{if(e.button!==0||!J.mouse)return;J.mouse=false;if(J.state==="play")jPress(false)});
  J.cv.addEventListener("contextmenu",e=>e.preventDefault());
  J.cv.addEventListener("blur",()=>jPause());
  document.addEventListener("visibilitychange",()=>{if(document.hidden)jPause()});
  new IntersectionObserver(es=>{if(!es[0].isIntersecting)jPause()},{threshold:.2}).observe(J.cv);
  jKeys();
}
renderHoops();
