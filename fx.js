/* Load and switch animations.
   Boot: a neutral loading screen stays up until the newest data (and the first live scores) are in, so the page never
   shows stale numbers or the default colors first. Then it lifts, the numbers count up, the bars, rings and lines draw
   in, and the colors fade in from grey to whatever the matchup calls for (no trip around the color wheel).
   Fantasy / Arena switch: the selected pill slides across, the new view slides in, and colors cross-fade. */
(()=>{
  const de=document.documentElement,t0=performance.now();
  const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
  let done=false;
  function ready(){return typeof D!=="undefined"&&D&&document.querySelector("#hero .big,#hero .mute")}
  function liveIn(){return !!window.__liveDone}
  function tick(){
    if(done)return;const el=performance.now()-t0;
    if(ready()&&liveIn()&&el>1100)return requestAnimationFrame(()=>requestAnimationFrame(reveal));   // live scores in and drawn
    if(el>10000&&ready())return reveal();
    if(el>9000)return reveal();
    setTimeout(tick,80);
  }
  function reveal(){
    if(done)return;done=true;
    // no re-render here (that read as a second load); just replay the count-ups on what's already drawn
    if(!RM&&typeof countUp==="function")document.querySelectorAll("#hero .big").forEach(el=>{el.textContent="0";countUp(el,+el.dataset.to,0)});
    de.classList.add("colorin","reveal");de.classList.remove("booting");
    const b=document.getElementById("boot");if(b){b.classList.add("out");setTimeout(()=>b.remove(),600)}
    if(!RM)countAll();
    setTimeout(()=>de.classList.remove("reveal"),2200);setTimeout(()=>de.classList.remove("colorin"),2400);
  }
  // count every big number up from zero, keeping its format (commas, %, +/-)
  function countAll(){
    const sel=".mdv,.mdring b,.hdd b,.hdscore span,.msrec b,.mss b,.mswp,.tpkgain b,.rmgain,.mood .mnum,.jjs span";
    document.querySelectorAll(sel).forEach(el=>{
      const node=[...el.childNodes].find(n=>n.nodeType===3&&/\d/.test(n.textContent));if(!node)return;
      const txt=node.textContent,m=txt.match(/^(\D*?)([\d,]+(?:\.\d+)?)(.*)$/s);if(!m)return;
      const to=parseFloat(m[2].replace(/,/g,"")),dec=(m[2].split(".")[1]||"").length,comma=m[2].includes(",");if(!isFinite(to)||to===0)return;
      const fmt=v=>m[1]+(comma?v.toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec}):v.toFixed(dec))+m[3];
      const s=performance.now(),f=t=>{const k=Math.min(1,(t-s)/1100);node.textContent=fmt(to*(1-Math.pow(1-k,4)));if(k<1)requestAnimationFrame(f)};node.textContent=fmt(0);requestAnimationFrame(f)});
  }
  if(de.classList.contains("booting"))tick();
  // live refreshes rebuild these with the same content most of the time: skip identical rewrites so nothing replays
  const desc=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML");
  for(const id of ["mood","heroDays","liveBox"]){const el=document.getElementById(id);if(!el)continue;
    Object.defineProperty(el,"innerHTML",{configurable:true,get(){return desc.get.call(this)},set(v){if(v===this.__h)return;this.__h=v;desc.set.call(this,v)}})}

  /* ---------- Fantasy / Arena switch ---------- */
  const seg=document.querySelector(".seg");
  if(seg){
    const pill=document.createElement("i");pill.className="segpill";seg.prepend(pill);seg.classList.add("haspill");
    const place=(anim)=>{const b=seg.querySelector('[aria-selected="true"]');if(!b)return;pill.style.transition=anim?"":"none";
      pill.style.width=b.offsetWidth+"px";pill.style.transform=`translateX(${b.offsetLeft-3}px)`};
    place(false);addEventListener("resize",()=>place(false));
    new MutationObserver(()=>place(true)).observe(seg,{subtree:true,attributes:true,attributeFilter:["aria-selected"]});
    if(typeof setView==="function"){
      const orig=setView;
      window.setView=function(v){
        const from=document.body.dataset.view||"fantasy";const r=orig.apply(this,arguments);if(RM||from===v)return r;
        const view=document.getElementById(v==="arena"?"arenaView":"fantasyView");
        de.classList.add("vswitch");view.classList.remove("vin-l","vin-r");void view.offsetWidth;view.classList.add(v==="arena"?"vin-r":"vin-l");
        clearTimeout(window.__vsT);window.__vsT=setTimeout(()=>{de.classList.remove("vswitch");view.classList.remove("vin-l","vin-r")},420);
        return r};
    }
  }
})();
