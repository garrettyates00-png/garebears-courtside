/* The one-line verdict at the very top of Fantasy: how the week is going, in plain words, and why.
   Win chance sets the base, today's pace vs expectation nudges it, refreshed with every data pull and live tick. */
const MOOD=[["Fucking awful","m1"],["Bad","m2"],["Shaky","m3"],["Going well","m4"],["Good","m5"],["Fucking great","m6"]];
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
  const [word,cls]=perfect?["Perfect","m6"]:MOOD[tier-1];
  // why
  const why=[];
  if(live){const lead=sm-so;why.push(`${lead>=0?"You lead":"You trail"} ${oname} <b>${moodNum(sm)}–${moodNum(so)}</b> and you're <b>${pc(wp)}%</b> to win.`)}
  else why.push(`You're projected <b>${moodNum(fm)}–${moodNum(fo)}</b> against ${oname}, <b>${pc(wp)}%</b> to win.`);
  if(dToday!=null){
    const best=N.filter(n=>n.s>0).sort((a,b)=>b.s-a.s)[0],worst=N.filter(n=>n.s<0).sort((a,b)=>a.s-b.s)[0];
    why.push(`Today you have <b>${moodNum(actToday)}</b>, ${Math.abs(dToday)<4?"right where you should be":dToday>0?`<b class="up">${moodNum(dToday)} ahead</b> of where you should be`:`<b class="down">${moodNum(-dToday)} behind</b> where you should be`}${best?`, led by ${esc(last(best.p.n))}`:""}${worst&&dToday<0?`; ${esc(last(worst.p.n))} is the drag`:""}.`);
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
  el.className="mood "+cls;
  el.innerHTML=`<div class="mword">${word}.</div><p class="mwhy">${why.join(" ")}</p>`;
}
