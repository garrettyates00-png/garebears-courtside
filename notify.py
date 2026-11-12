"""Grindex alerts: push notifications to your phone through ntfy (https://ntfy.sh, free app for iOS/Android).

Runs right after every data refresh. It compares the new data.json with what it saw last time (notify_state.json)
and sends a push for anything new that matters:

  injury   one of your players changes injury status; urgent if he's in today's lineup and his team plays today,
           with the best bench player (or free agent) who plays today to swap in
  lineup   a starter of yours isn't playing today while someone on your bench is
  upgrade  a free agent is clearly better than your weakest healthy player (season-long, not a one-week stream)
  stream   a pickup that adds real points this week (more games), after counting what it costs later
  dropped  a good player was just dropped by another team (on waivers now)
  trade    a trade offer to you, or any trade that goes through in the league
  roster   your own adds/drops/claims going through

The topic name comes from the NTFY_TOPIC repo secret, which you set yourself. Without it, nothing is sent and the
state still updates, so turning it on later doesn't flood you with old news.
"""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

import requests

TZ = ZoneInfo("America/Chicago")
SITE = "https://garrettyates00-png.github.io/garebears-courtside/"
STATE = "notify_state.json"
TOPIC = os.environ.get("NTFY_TOPIC", "").strip()
SILENT = False                # first run: learn the current state without pinging about all of it
SERVER = os.environ.get("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
OUT = ("OUT", "INJURY_RESERVE")
INJ_TXT = {"OUT": "OUT", "INJURY_RESERVE": "on IR", "DAY_TO_DAY": "day-to-day", "QUESTIONABLE": "questionable",
           "DOUBTFUL": "doubtful", "PROBABLE": "probable", "SUSPENSION": "suspended", "": "back to full health"}

def send(title, body, prio=3, tags="basketball", log=None):
    log.append(dict(at=dt.datetime.now(TZ).isoformat(timespec="minutes"), title=title, body=body, prio=prio))
    if SILENT: return
    if not TOPIC:
        print("(no NTFY_TOPIC) would send:", title, "|", body); return
    try:
        # JSON publishing keeps emoji and accents intact (HTTP headers can't carry them reliably)
        r = requests.post(SERVER, json=dict(topic=TOPIC, title=title, message=body, priority=prio, tags=tags.split(","), click=SITE), timeout=15)
        print("sent", r.status_code, title)
    except Exception as e:
        print("send failed", e)

def main():
    test = "--test" in sys.argv
    d = json.load(open("data.json"))
    try:
        st = json.load(open(STATE))
    except Exception:
        st = {}
    first = not st.get("seeded")
    global SILENT; SILENT = first and not test
    log = st.get("log", [])
    sent = []                       # this run's messages
    now = dt.datetime.now(TZ)
    today = now.date().isoformat()
    me = d["me"]
    teams = d["teams"]
    tname = lambda t: (teams.get(str(t)) or {}).get("name", f"Team {t}")
    mine = [p for p in d["players"] if p["t"] == me]
    fa = [f for f in d.get("fa", []) if not f.get("claimed")]

    if test:
        send("Grindex alerts are working", "Test alert. You'll get pings for injuries, lineup problems, pickups worth making, drops and trades.", 3, "white_check_mark", sent)
        st["log"] = (sent + log)[:60]; json.dump(st, open(STATE, "w"), indent=1); return

    plays_today = lambda p: today in (p.get("days") or [])
    starting = lambda p: p.get("slot") not in ("BE", "IR", None)

    # ---------- injuries on my team ----------
    prev_inj = st.get("inj", {})
    news = {n["n"]: n for n in d.get("news", []) if n.get("t") == me}
    bench_today = sorted([p for p in mine if p.get("slot") == "BE" and plays_today(p) and p["inj"] not in OUT], key=lambda p: -p["pa"])
    fa_today = sorted([f for f in fa if f.get("st") == "FREEAGENT" and f["inj"] not in OUT and f.get("today")], key=lambda f: -f["pa"])
    for p in mine:
        cur, old = p["inj"] or "", prev_inj.get(str(p["id"]))
        if old is None or cur == old: continue
        if p.get("slot") == "IR" and cur in OUT: continue
        urgent = cur in OUT + ("DOUBTFUL", "QUESTIONABLE", "DAY_TO_DAY") and starting(p) and plays_today(p)
        body = f"{p['n']} is {INJ_TXT.get(cur, cur.lower())}."
        if urgent:
            body += " He's in your lineup today."
            if cur in OUT:
                if bench_today: body += f" Swap in {bench_today[0]['n']} ({bench_today[0]['pa']:.0f} avg), he plays today."
                elif fa_today: body += f" Nobody on your bench plays today. Free agent {fa_today[0]['n']} ({fa_today[0]['tm']}, {fa_today[0]['pa']:.0f} avg) does."
        nw = news.get(p["n"])
        if nw and nw.get("text") and nw.get("date", "") >= (now.date() - dt.timedelta(days=1)).isoformat(): body += "\n" + nw["text"]
        send(("🚨 " if urgent else "") + f"{p['n']}: {INJ_TXT.get(cur, cur.lower())}", body, 5 if urgent and cur in OUT else 4 if urgent else 3,
             "rotating_light" if urgent else "ambulance" if cur else "muscle", sent)
    st["inj"] = {str(p["id"]): p["inj"] or "" for p in mine}

    # ---------- lineup: a starter sits today while a bench guy plays (once a day) ----------
    idle = [p for p in mine if starting(p) and (not plays_today(p) or p["inj"] in OUT)]
    if idle and bench_today and st.get("lineup_day") != today and now.hour < 18:
        a, b = idle[0], bench_today[0]
        why = "is out" if a["inj"] in OUT else "doesn't play today"
        send("Lineup check", f"{a['n']} {why} but is in your lineup. {b['n']} is on your bench and plays today."
             + (f" ({len(idle)} starters aren't playing, {len(bench_today)} bench players are.)" if len(idle) > 1 else ""), 4, "clipboard", sent)
        st["lineup_day"] = today

    # ---------- free agents ----------
    healthy = [p for p in mine if p.get("slot") != "IR" and p["inj"] not in OUT]
    weakest = min(healthy, key=lambda p: p["pa"]) if healthy else None
    seen_up = st.get("upgrade", {})
    if weakest:
        for f in sorted(fa, key=lambda f: -f["pa"]):
            if f["inj"] in OUT or f["pa"] < weakest["pa"] + 2.0: continue
            k = str(f["id"])
            if k in seen_up and f["pa"] < seen_up[k] + 2: continue
            how = "free agent, add him now" if f.get("st") == "FREEAGENT" else f"on waivers, clears {f.get('wclear') or 'soon'}"
            send(f"⬆️ Upgrade: {f['n']}", f"{f['n']} ({f['tm']}, {f['pa']:.1f} avg) is a {how}. Your weakest healthy player is {weakest['n']} ({weakest['pa']:.1f}).", 4, "arrow_up", sent)
            seen_up[k] = f["pa"]
    st["upgrade"] = seen_up

    seen_mv = st.get("stream", {})
    wk = str(d.get("period"))
    for m in d.get("moves", []):
        if m.get("net", 0) < 8: continue
        k = f"{wk}|{m['add_id']}|{m.get('drop_id')}"
        if k in seen_mv: continue
        swap = f"drop {m['drop']}" if m.get("drop") else (f"move {m['ir']} to IR" if m.get("ir") else "open roster spot")
        send(f"📈 Pickup: +{m['gain']:.0f} this week", f"Add {m['add']} ({m['addtm']}, {m['games']} games from {m['from_day']}), {swap}. "
             f"About +{m['gain']:.0f} points this week" + (f", about {m['ros']:.0f} less after that" if m.get("ros") else "") + ".", 4, "chart_with_upwards_trend", sent)
        seen_mv[k] = today
    st["stream"] = {k: v for k, v in seen_mv.items() if k.startswith(wk + "|")}

    prev_fa = set(st.get("fa_ids", []))
    if prev_fa and weakest:
        for f in fa:
            if f["id"] in prev_fa or f["inj"] in OUT or f["pa"] < weakest["pa"] - 1.5 or str(f["id"]) in seen_up: continue
            send(f"🆓 Just dropped: {f['n']}", f"{f['n']} ({f['tm']}, {f['pa']:.1f} avg) is now available"
                 + (f", on waivers until {f['wclear']}" if f.get("st") == "WAIVERS" and f.get("wclear") else "")
                 + f". Your weakest healthy player is {weakest['n']} ({weakest['pa']:.1f}).", 3, "free", sent)
    st["fa_ids"] = sorted(f["id"] for f in fa)

    # ---------- trades and transactions ----------
    seen_tx = set(st.get("tx", []))
    for c in d.get("league_pending", []):
        if "TRADE" not in (c.get("type") or ""): continue
        k = "p|" + "|".join(sorted(f"{i.get('n')}>{i.get('to')}" for i in c["items"]))
        if k in seen_tx: continue
        seen_tx.add(k)
        if any(i.get("to") == me or i.get("frm") == me for i in c["items"]) and not c.get("mine"):
            get = [i["n"] for i in c["items"] if i.get("to") == me]; give = [i["n"] for i in c["items"] if i.get("frm") == me]
            send("🤝 Trade offer", f"You get {', '.join(get)} for {', '.join(give)}. Run it in the Trade lab before you answer.", 5, "handshake", sent)
    for c in d.get("recent", []):
        k = "r|" + c.get("date", "") + "|" + str(c.get("t")) + "|" + "|".join(sorted(f"{i.get('kind')}:{i.get('n')}" for i in c["items"]))
        if k in seen_tx: continue
        seen_tx.add(k)
        if first: continue
        if "TRADE" in (c.get("type") or ""):
            sides = {}
            for i in c["items"]: sides.setdefault(i.get("to"), []).append(i["n"])
            send("🔁 Trade in the league", "; ".join(f"{tname(t)} get {', '.join(n)}" for t, n in sides.items()), 4 if me in sides else 3, "repeat", sent)
        elif c.get("t") == me:
            adds = [i["n"] for i in c["items"] if i.get("kind") == "ADD"]; drops = [i["n"] for i in c["items"] if i.get("kind") == "DROP"]
            if adds or drops:
                send("✅ Your move went through", " · ".join(x for x in [("Added " + ", ".join(adds)) if adds else "", ("Dropped " + ", ".join(drops)) if drops else ""] if x), 3, "white_check_mark", sent)
        elif c.get("t") == d.get("opp"):
            adds = [i["n"] for i in c["items"] if i.get("kind") == "ADD"]
            if adds: send(f"👀 {tname(c['t'])} made a move", "Your opponent added " + ", ".join(adds) + ".", 2, "eyes", sent)
    st["tx"] = sorted(seen_tx)[-400:]

    if first:
        sent = []; SILENT = False
        send("Grindex alerts are on", "You'll get pings for injuries, lineup problems, pickups worth making, drops and trades.", 3, "white_check_mark", sent)
        st["seeded"] = True
    st["log"] = (sent + log)[:60]
    st["at"] = now.isoformat(timespec="minutes")
    st["on"] = bool(TOPIC)
    json.dump(st, open(STATE, "w"), indent=1)

if __name__ == "__main__":
    main()
