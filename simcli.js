/* Runs the page's season simulator (sim.js) on a data.json from the command line, so the timeline's
   snapshots use exactly the same model and random draws as the Season simulator on the page.
   Usage: node simcli.js path/to/data.json [n]   ->  prints {"<team id>": {"po":..,"title":..,"wins":..}} */
const fs=require("fs"),path=require("path");
const src=fs.readFileSync(path.join(__dirname,"sim.js"),"utf8");
global.self={};global.PHONE=false;global.$=()=>null;
global.D=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const n=+(process.argv[3]||10000);
const run=new Function(src.match(/const SIM_WORKER=`([\s\S]*?)`;/)[1]+";return run;")();
eval(src.slice(src.indexOf("function simCfg"),src.indexOf("let simQ")));
const r=run(simCfg(),simPlayers(),null,n,20261020);
const out={};r.teams.forEach((t,i)=>out[String(t)]={po:+r.po[i].toFixed(4),title:+r.title[i].toFixed(4),wins:+r.wins[i].toFixed(2)});
process.stdout.write(JSON.stringify(out));
