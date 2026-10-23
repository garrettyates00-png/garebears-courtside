/* Section navigation: a sliding-ink nav row in the header on desktop, a hamburger drawer on phones.
   Links follow the current view (Fantasy, Arena Team, Arena Season); the drawer lists all three. */
const NAV={
  fantasy:{label:"Fantasy",items:[["hero","Matchup"],["secMatchups","Matchups"],["secLineup","Lineup"],["secPower","Rankings"],["secMoves","Moves"],["how","How it works"],["newsroom","News"]]},
  team:{label:"Arena · Team",items:[["aHero","Team"],["aNext","Next game"],["aGames","Games"],["aShots","Shot chart"],["aImpact","Impact"],["aTeam","Team stats"],["aMedia","Highlights"],["aNews","News"],["aSched","Schedule"]]},
  season:{label:"Arena · Season",items:[["sMine","Your players"],["sBoard","Scoreboard"],["sBets","My bets"],["sAvg","Averages"]]}
};
const curGroup=()=>document.body.dataset.view!=="arena"?"fantasy":($("#aSeasonPane")&&!$("#aSeasonPane").hidden?"season":"team");
let navActive=null,navLock=0;

function goSection(group,id){
  const go=()=>{const el=document.getElementById(id);if(!el)return;
    const top=el.getBoundingClientRect().top+scrollY-(document.querySelector(".bar").getBoundingClientRect().bottom)-14;
    navLock=Date.now()+900;setActive(id);scrollTo({top:Math.max(0,top),behavior:reduce?"auto":"smooth"})};
  if(group!==curGroup()){
    if(group==="fantasy")setView("fantasy");else{if(document.body.dataset.view!=="arena")setView("arena");setSub(group)}
    setTimeout(go,350);
  }else go();
}

function navBuild(){
  const g=curGroup(),nav=$("#snav");
  nav.innerHTML='<i class="ink" aria-hidden="true"></i>'+NAV[g].items.map(([id,l],i)=>`<a href="#${id}" data-id="${id}" data-g="${g}" style="--i:${i}">${l}</a>`).join("");
  nav.classList.remove("in");void nav.offsetWidth;nav.classList.add("in");
  const P=$("#drawer .dpanel");
  P.innerHTML=Object.entries(NAV).map(([k,G])=>`<div class="dgrp ${k===g?"cur":""}"><div class="eyebrow">${G.label}</div>${G.items.map(([id,l])=>`<a href="#${id}" data-id="${id}" data-g="${k}">${l}</a>`).join("")}</div>`).join("");
  P.querySelectorAll("a").forEach((a,i)=>a.style.setProperty("--i",i));
  navActive=null;spy();
}
function ink(a){const nav=$("#snav"),k=nav.querySelector(".ink");if(!a){k.style.opacity=0;return}
  const r=a.getBoundingClientRect(),n=nav.getBoundingClientRect();k.style.opacity=1;k.style.width=(r.width-20)+"px";k.style.transform=`translateX(${r.left-n.left+nav.scrollLeft+10}px)`}
function setActive(id){if(id===navActive)return;navActive=id;
  document.querySelectorAll("#snav a, #drawer a").forEach(a=>{const on=a.dataset.id===id;a.classList.toggle("on",on);on?a.setAttribute("aria-current","true"):a.removeAttribute("aria-current")});
  const a=$(`#snav a[data-id="${id}"]`);ink(a);if(a&&innerWidth>700)a.scrollIntoView({block:"nearest",inline:"nearest"})}
function spy(){
  if(Date.now()<navLock)return;
  const line=document.querySelector(".bar").getBoundingClientRect().bottom+60;let best=null;
  for(const [id] of NAV[curGroup()].items){const el=document.getElementById(id);if(!el||!el.offsetParent)continue;if(el.getBoundingClientRect().top<=line)best=id}
  if(innerHeight+scrollY>=document.documentElement.scrollHeight-4){const it=NAV[curGroup()].items;best=it[it.length-1][0]}
  setActive(best||NAV[curGroup()].items[0][0]);
}
let spyQ=false;addEventListener("scroll",()=>{if(!spyQ){spyQ=true;requestAnimationFrame(()=>{spyQ=false;spy()})}},{passive:true});
addEventListener("resize",()=>{const a=$("#snav a.on");ink(a)});

$("#snav").addEventListener("click",e=>{const a=e.target.closest("a");if(!a)return;e.preventDefault();goSection(a.dataset.g,a.dataset.id)});
$("#snav").addEventListener("mouseover",e=>{const a=e.target.closest("a");if(a)ink(a)});
$("#snav").addEventListener("mouseleave",()=>ink($("#snav a.on")));

/* drawer */
function drawer(open){const d=$("#drawer"),b=$("#burger");
  if(open){d.hidden=false;requestAnimationFrame(()=>d.classList.add("open"));b.setAttribute("aria-expanded","true");b.classList.add("x");const f=d.querySelector("a.on")||d.querySelector("a");f&&f.focus({preventScroll:true})}
  else{d.classList.remove("open");b.setAttribute("aria-expanded","false");b.classList.remove("x");setTimeout(()=>{if(!d.classList.contains("open"))d.hidden=true},320)}}
$("#burger").addEventListener("click",e=>{e.stopPropagation();drawer($("#drawer").hidden)});
$("#drawer").addEventListener("click",e=>{const a=e.target.closest("a");if(a){e.preventDefault();drawer(false);goSection(a.dataset.g,a.dataset.id);return}if(e.target.id==="drawer")drawer(false)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#drawer").hidden){drawer(false);$("#burger").focus()}});

/* rebuild when the view or Arena sub-tab changes */
new MutationObserver(navBuild).observe(document.body,{attributes:true,attributeFilter:["data-view"]});
if($("#aSeasonPane"))new MutationObserver(navBuild).observe($("#aSeasonPane"),{attributes:true,attributeFilter:["hidden"]});
navBuild();
