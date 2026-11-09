/* The one-line verdict at the very top of Fantasy: how the week is going, in plain words, and why.
   Win chance sets the base, today's pace vs expectation nudges it, refreshed with every data pull and live tick. */
const MOOD=[["Fucking awful","m1","This shit is ugly. Somebody check the lineup."],["Shitty","m2","Not dead yet, but it smells like shit."],
  ["Mid as hell","m3","Coin flip. Somebody needs to fucking show up."],["Pretty damn good","m4","Keep this shit rolling."],
  ["Damn good","m5","You're cooking. Don't fuck it up."],["Fucking great","m6","Absolutely cooking their ass."]];
function moodNum(v){return Math.round(v).toLocaleString("en-US")}
function renderMood(){
  const el=$("#mood");if(!el||!D||!D.opp||!D.teams[D.opp]){if(el)el.innerHTML="";return}
  const me=D.me,op=D.opp,T=D.teams,today=TODAY();
  const live=typeof isLiveWeek==="function"&&isLiveWeek();
  const sm=live?liveScore(me):0,so=live?liveScore(op):0,fm=finalMean(me),fo=finalMean(op);
  const wp=winProb(me,op),oname=esc(T[op].name);
  // today: actual so far vs what should be in by now, at today's projections
  const di=dayInfo(me,today);let past=0;const B=D.base&&D.base.teams[me];
  if(B)for(const [k,d] of Object.entries(B.days))if(k<today)past+=d.pts;
  const ex=expectedSoFar(me),expToday=ex==null?null:Math.max(0,ex-past),actToday=di.actual;
  const dToday=actToday!=null&&expToday!=null&&expToday>5?actToday-expToday:null;
  // tier: win chance first, today's pace moves it one step
  let tier=wp>=.88?6:wp>=.72?5:wp>=.55?4:wp>=.4?3:wp>=.2?2:1;
  if(dToday!=null){if(dToday>=20&&tier<6)tier++;else if(dToday<=-20&&tier>1)tier--}
  // perfect day: every starter whose game is over beat his number and you're comfortably ahead
  const N=typeof notes==="function"?notes(me):[];
  const done=N.filter(n=>/finished with/.test(n.t));
  const perfect=done.length>=3&&done.every(n=>n.s>0)&&wp>=.75;
  const insane=wp>=.97&&dToday!=null&&dToday>=30;
  const [word,cls,quip]=insane?["Fucking insane","m6","Call it. This one's over."]:perfect?["Fucking perfect","m6","Every damn starter beat his number."]:MOOD[tier-1];
  // why
  const why=[];
  if(live){const lead=sm-so,sc=`<b>${moodNum(sm)}–${moodNum(so)}</b>`;
    const how=lead>=150?`You're beating ${oname}'s ass ${sc}`:lead>=40?`You lead ${oname} ${sc}`:lead>=0?`You're barely ahead of ${oname} ${sc}`
      :lead>-40?`You're barely behind ${oname} ${sc}`:lead>-150?`You trail ${oname} ${sc}`:`${oname} are kicking your ass ${sc}`;
    why.push(`${how}, and you're <b>${pc(wp)}%</b> to win.`)}
  else why.push(`You're projected <b>${moodNum(fm)}–${moodNum(fo)}</b> against ${oname}, <b>${pc(wp)}%</b> to win.`);
  if(dToday!=null){
    const best=N.filter(n=>n.s>0).sort((a,b)=>b.s-a.s)[0],worst=N.filter(n=>n.s<0).sort((a,b)=>a.s-b.s)[0];
    why.push(`Today you have <b>${moodNum(actToday)}</b>, ${Math.abs(dToday)<4?"right where you should be":dToday>0?`<b class="up">${moodNum(dToday)} ahead</b> of where you should be${dToday>=25?" (hell yeah)":""}`:`<b class="down">${moodNum(-dToday)} behind</b> where you should be${dToday<=-25?" (come the fuck on)":""}`}${best?`, led by ${esc(last(best.p.n))}`:""}${worst&&dToday<0?`; ${esc(last(worst.p.n))} is the drag`:""}.`);
  }
  const left=P(me).filter(p=>!isBench(p.slot)&&(()=>{const g=gameOf(p);return g&&g.state!=="post"})()).length;
  if(left)why.push(`${left} of your starter${left>1?"s":""} still to play today.`);
  if(live){
    const gap=fm-fo;
    const lead=sm-so,fin=`<b>${moodNum(fm)}–${moodNum(fo)}</b>`;
    why.push(gap>=0&&lead<0?`You have more games left, so it should flip: about ${fin} at the end.`
      :gap>=0?`It should end around ${fin}.`
      :lead>=0?`They have more left, though: it projects ${fin}, so you need about <b>${moodNum(-gap)}</b> more than projected.`
      :`On current pace it ends around ${fin}; you need about <b>${moodNum(-gap)}</b> more than projected over the rest of the week.`);
  }
  // ---- what changed since the last look: snapshots kept on this device, per matchup week ----
  const K="grindex-mood",now=Date.now();let H={};try{H=JSON.parse(localStorage.getItem(K)||"{}")}catch(e){}
  if(H.wk!==D.period)H={wk:D.period,s:[]};
  const pts=t=>{const o={};for(const p of P(t)){if(isBench(p.slot))continue;const r=LV.rows&&LV.rows[p.id];if(r&&!r.dnp)o[p.id]=r.fp}return o};
  const snap={t:now,wp:+wp.toFixed(3),sm:Math.round(sm),so:Math.round(so),fm:Math.round(fm),fo:Math.round(fo),d:today,me:pts(me),op:pts(op)};
  const lastS=H.s[H.s.length-1];
  if(!lastS||Math.abs(lastS.wp-snap.wp)>=.005||now-lastS.t>10*60e3||lastS.sm!==snap.sm||lastS.so!==snap.so){H.s.push(snap);H.s=H.s.slice(-80)}
  try{localStorage.setItem(K,JSON.stringify(H))}catch(e){}
  const ref=[...H.s].reverse().find(x=>now-x.t>12*60e3&&Math.abs(x.wp-snap.wp)>=.01)||null;
  let chg="";
  if(ref){
    const dw=(snap.wp-ref.wp)*100,when=new Date(ref.t),ws=when.toDateString()===new Date().toDateString()?when.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):when.toLocaleDateString("en-US",{weekday:"short"})+" "+when.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    const gain=(cur,old,t)=>Object.entries(cur).map(([id,v])=>[id,v-((ref.d===today?old[id]:0)||0)]).filter(x=>x[1]>=1).sort((a,b)=>b[1]-a[1]);
    const gm=gain(snap.me,ref.me||{},me),go=gain(snap.op,ref.op||{},op);
    const nm=id=>esc(last((D.players.find(p=>String(p.id)===String(id))||{}).n||""));
    const myAdd=snap.sm-ref.sm,opAdd=snap.so-ref.so,projM=snap.fm-ref.fm,projO=snap.fo-ref.fo;
    const bits=[];
    if(myAdd||opAdd)bits.push(`you scored <b>${moodNum(myAdd)}</b>${gm.length?` (${gm.slice(0,2).map(([id,v])=>`${nm(id)} +${Math.round(v)}`).join(", ")})`:""}, they scored <b>${moodNum(opAdd)}</b>${go.length?` (${go.slice(0,2).map(([id,v])=>`${nm(id)} +${Math.round(v)}`).join(", ")})`:""}`);
    if(Math.abs(projM)>=8||Math.abs(projO)>=8)bits.push(`your projection ${projM>=0?"rose":"fell"} ${Math.abs(projM)}`+(Math.abs(projO)>=8?`, theirs ${projO>=0?"rose":"fell"} ${Math.abs(projO)}`:""));
    chg=`<div class="mchg ${dw>=0?"up":"down"}"><span class="mchgv">${dw>=0?"▲":"▼"} ${Math.abs(dw).toFixed(0)}% win chance</span><span>since ${ws}${bits.length?": "+bits.join("; "):""}.</span></div>`;
  }
  // win-chance trail for the week (this device's snapshots)
  const tr=H.s.map(x=>x.wp);let spark="";
  if(tr.length>=3){const lo=Math.max(0,Math.min(...tr,.5)-.06),hi=Math.min(1,Math.max(...tr,.5)+.06);
    const W=220,Hh=48,X=i=>i/(tr.length-1)*W,Y=v=>Hh-4-(v-lo)/(hi-lo||1)*(Hh-8);
    const d_=tr.map((v,i)=>`${i?"L":"M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    spark=`<svg class="mspark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-label="Win chance this week"><line x1="0" x2="${W}" y1="${Y(.5)}" y2="${Y(.5)}" class="mmid"/><path d="${d_} L${W} ${Hh} L0 ${Hh}Z" class="marea"/><path d="${d_}" class="mline"/><circle cx="${X(tr.length-1)}" cy="${Y(tr[tr.length-1])}" r="3.5" class="mdot"/></svg>`}
  // gauge
  const R=46,C=2*Math.PI*R,arc=C*.75,fill=arc*wp;
  const gauge=`<svg class="mgauge" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="mg0" stroke-dasharray="${arc} ${C}" transform="rotate(135 60 60)"/><circle cx="60" cy="60" r="${R}" class="mg1" stroke-dasharray="${fill} ${C}" transform="rotate(135 60 60)"/></svg><div class="mgv"><b>${pc(wp)}%</b><span>to win</span></div>`;
  const oleft=P(op).filter(p=>!isBench(p.slot)&&(()=>{const g=gameOf(p);return g&&g.state!=="post"})()).length;
  const chip=(l,v,c="")=>`<div class="mchip"><span>${l}</span><b class="${c}">${v}</b></div>`;
  const lead=sm-so;
  const n0=v=>String(Math.round(v)),vs=(a,b)=>`${n0(a)}<small>vs ${n0(b)}</small>`;
  const chips=[live?chip("Score",vs(sm,so),lead>=0?"up":"down"):chip("Projected",vs(fm,fo)),
    dToday!=null?chip("Today",`${dToday>=0?"+":"−"}${n0(Math.abs(dToday))}<small>vs pace</small>`,dToday>=0?"up":"down"):"",
    LV.ok?chip("Left",`${left}<small>vs ${oleft}</small>`):"",
    live?chip("Final",vs(fm,fo),fm>=fo?"up":"down"):""].join("");
  el.className="mood "+cls;
  el.innerHTML=`<div class="mglow" aria-hidden="true"></div>
    <div class="mtop"><div class="mleft"><div class="meye">This week vs ${oname}</div><div class="mword">${word}.</div><div class="mquip">${quip}</div></div>
      <div class="mright"><div class="mgw">${gauge}</div></div></div>
    <div class="mchips">${chips}</div>
    ${chg}
    <p class="mwhy">${why.join(" ")}</p>
    ${spark?`<div class="msp"><span class="meye">Win chance this week · ${pc(Math.min(...tr))}–${pc(Math.max(...tr))}%</span>${spark}</div>`:""}`;
}
