"""Pull the Angel Reese Invitational from ESPN and write data.json for the dashboard.

Needs two cookies from a signed-in ESPN session, passed as environment variables:
  ESPN_S2  and  ESPN_SWID
They live in GitHub Actions secrets, never in this repo.
"""
import json, os, sys, html, datetime as dt
from zoneinfo import ZoneInfo
import requests
import numpy as np
from scipy.optimize import linear_sum_assignment
from setlineup import plan_moves

LEAGUE = int(os.environ.get("LEAGUE_ID", "733085335"))
SEASON = int(os.environ.get("SEASON", "2027"))
MY_TEAM = int(os.environ.get("MY_TEAM_ID", "3"))
TZ = ZoneInfo("America/Chicago")
BASE = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{SEASON}"
LG = f"{BASE}/segments/0/leagues/{LEAGUE}"
COOKIES = {"espn_s2": os.environ.get("ESPN_S2", ""), "SWID": os.environ.get("ESPN_SWID", "")}
HDR = {"User-Agent": "Mozilla/5.0 courtside"}
# ESPN matchup weeks: week 1 is opening night (Tue Oct 20) through Sun Oct 25, then Mon-Sun.
WEEK1_START = dt.date(2026, 10, 20)
WEEK2_START = dt.date(2026, 10, 26)

SLOT = {0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C", 5: "G", 6: "F", 11: "UTIL", 12: "BE", 13: "IR"}
POS = {1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C"}
STAT = {0: "pts", 1: "blk", 2: "stl", 3: "ast", 4: "oreb", 6: "reb", 11: "to", 17: "tpm"}
AVAIL = {"OUT": 0.0, "SUSPENSION": 0.0, "INJURY_RESERVE": 0.0, "DAY_TO_DAY": 0.85, "QUESTIONABLE": 0.85, "DOUBTFUL": 0.3}


def get(url, params=None, headers=None):
    h = dict(HDR, **(headers or {}))
    r = requests.get(url, params=params, cookies=COOKIES, headers=h, timeout=30)
    r.raise_for_status()
    return r.json()


def week_range(i):
    if i == 1:
        return WEEK1_START, dt.date(2026, 10, 25)
    s = WEEK2_START + dt.timedelta(days=7 * (i - 2))
    return s, s + dt.timedelta(days=6)


def short_name(first, last):
    return f"{first} {last[:1]}." if last else first


def main():
    lg = get(LG, [("view", v) for v in ["mSettings", "mTeam", "mRoster", "mMatchupScore", "mSchedule", "mStatus", "mPendingTransactions"]])
    pro = get(BASE, {"view": "proTeamSchedules_wl"})
    settings = lg["settings"]
    scoring = {s["statId"]: s["points"] for s in settings["scoringSettings"]["scoringItems"]}
    slots = []
    for sid, n in sorted(settings["rosterSettings"]["lineupSlotCounts"].items(), key=lambda x: int(x[0])):
        sid = int(sid)
        if sid in SLOT and SLOT[sid] not in ("BE", "IR"):
            slots += [SLOT[sid]] * n

    mem = {m["id"]: (m.get("firstName", ""), m.get("lastName", "")) for m in lg.get("members", [])}
    teams = {}
    for t in lg["teams"]:
        f, l = mem.get(t.get("primaryOwner") or t["owners"][0], ("", ""))
        rec = t.get("record", {}).get("overall", {})
        teams[t["id"]] = dict(name=t["name"].strip(), owner=short_name(f, l), w=rec.get("wins", 0), l=rec.get("losses", 0),
                              pf=round(rec.get("pointsFor", 0), 1))

    # NBA schedule: team abbrev and game dates (Central time)
    pro_abbr, games = {}, {}
    for t in pro["settings"]["proTeams"]:
        pro_abbr[t["id"]] = t["abbrev"].upper()
        ds = set()
        for gs in (t.get("proGamesByScoringPeriod") or {}).values():
            for g in gs:
                ds.add(dt.datetime.fromtimestamp(g["date"] / 1000, TZ).date())
        games[t["id"]] = ds

    now_ct = dt.datetime.now(TZ)
    tip_at = {}  # pro abbrev -> today's tip-off
    for t in pro["settings"]["proTeams"]:
        for gs in (t.get("proGamesByScoringPeriod") or {}).values():
            for g in gs:
                d = dt.datetime.fromtimestamp(g["date"] / 1000, TZ)
                if d.date() == now_ct.date(): tip_at[t["abbrev"].upper()] = d

    cur_mp = lg["status"]["currentMatchupPeriod"]
    weeks = settings["scheduleSettings"]["matchupPeriods"][str(cur_mp)]
    wk_start, wk_end = week_range(weeks[0])[0], week_range(weeks[-1])[1]
    today = dt.datetime.now(TZ).date()
    first_day = max(today, wk_start)
    days = [first_day + dt.timedelta(days=i) for i in range((wk_end - first_day).days + 1)]
    all_days = [wk_start + dt.timedelta(days=i) for i in range((wk_end - wk_start).days + 1)]
    nxt_start, nxt_end = week_range(weeks[-1] + 1)

    players = []
    for t in lg["teams"]:
        for e in t["roster"]["entries"]:
            p = e["playerPoolEntry"]["player"]
            stats = {s["id"]: s for s in p.get("stats", [])}
            pj = stats.get(f"10{SEASON}") or {}
            ls = stats.get(f"00{SEASON - 1}") or {}
            cur = stats.get(f"00{SEASON}") or {}
            avg = pj.get("averageStats", {})
            inj = p.get("injuryStatus", "ACTIVE")
            gd = games.get(p["proTeamId"], set())
            players.append(dict(
                t=t["id"], id=p["id"], n=p["fullName"], tm=pro_abbr.get(p["proTeamId"], "FA"),
                el=[SLOT[s] for s in p["eligibleSlots"] if s in (0, 1, 2, 3, 4)],
                inj="" if inj == "ACTIVE" else inj, av=AVAIL.get(inj, 1.0),
                slot=SLOT.get(e["lineupSlotId"], "BE"),
                pa=round(pj.get("appliedAverage", 0) or 0, 1),
                la=round(ls.get("appliedAverage", 0), 1) if ls.get("appliedAverage") else None,
                ca=round(cur.get("appliedAverage", 0), 1) if cur.get("appliedAverage") else None,
                cg=round(cur["appliedTotal"] / cur["appliedAverage"]) if cur.get("appliedAverage") else 0,
                **{v: round(avg.get(str(k), avg.get(k, 0)) or 0, 1) for k, v in STAT.items()},
                days=[d.isoformat() for d in days if d in gd],
                gw=sum(1 for d in gd if wk_start <= d <= wk_end),
                gn=sum(1 for d in gd if nxt_start <= d <= nxt_end),
            ))

    def value(p):
        # Season-long ESPN projection, nudged toward actual scoring once a player has 5+ games.
        v = p["pa"]
        if p["cg"] >= 5 and p["ca"] is not None:
            w = min(0.6, p["cg"] / 25)
            v = (1 - w) * v + w * p["ca"]
        return v * p["av"]

    def fits(p, s):
        e = p["el"]
        if s == "UTIL": return True
        if s == "G": return "PG" in e or "SG" in e
        if s == "F": return "SF" in e or "PF" in e
        return s in e

    def best(cands, sl=None):
        sl = slots if sl is None else sl
        if not cands or not sl: return 0.0, []
        M = np.full((len(cands), len(sl)), -1e6)
        for i, p in enumerate(cands):
            for j, s in enumerate(sl):
                if fits(p, s): M[i, j] = value(p)
        r, c = linear_sum_assignment(-M)
        out = sorted([(sl[j], cands[i]["n"]) for i, j in zip(r, c) if M[i, j] > 0], key=lambda x: (slots.index(x[0]), x[1]))
        return sum(M[i, j] for i, j in zip(r, c) if M[i, j] > 0), out

    def locked(p):
        t0 = tip_at.get(p["tm"])
        return t0 is not None and now_ct >= t0 - dt.timedelta(minutes=5)

    def week_plan(roster, contrib=None, dlist=None, live_today=True):
        """Best lineup per day. For today (live_today), players whose game has tipped are already in the live
        score, so they are left out of 'to come' and their lineup slots are taken."""
        tot, daily, starts = 0.0, [], 0
        for d in (days if dlist is None else dlist):
            ds = d.isoformat()
            cands = [p for p in roster if ds in p["days"] and p["av"] > 0]
            sl = slots
            gone = []
            if live_today and d == today:
                gone = [p for p in cands if locked(p)]
                sl = list(slots)
                for p in gone:
                    if p.get("slot") in sl: sl.remove(p["slot"])
                cands = [p for p in cands if not locked(p)]
            sc, lu = best(cands, sl)
            st = {n for _, n in lu}
            if contrib is not None:
                for p in cands:
                    if p["n"] in st:
                        c = contrib.setdefault(p["n"], [0.0, 0]); c[0] += value(p); c[1] += 1
            daily.append(dict(day=d.strftime("%a %b ") + str(d.day), iso=ds, pts=round(sc, 1), start=lu,
                              bench=[p["n"] for p in cands if p["n"] not in st],
                              pp={p["id"]: round(value(p), 1) for p in cands + gone},
                              locked=[p["id"] for p in gone if p.get("slot", "BE") not in ("BE", "IR")]))
            tot += sc; starts += len(lu)
        return round(tot, 1), daily, starts

    # Live matchup scores for the current period
    live = {}
    for m in lg["schedule"]:
        if m["matchupPeriodId"] != cur_mp: continue
        for side in ("home", "away"):
            s = m.get(side, {})
            live[s.get("teamId")] = round(s.get("totalPointsLive", s.get("totalPoints", 0)) or 0, 1)
    sched = [[m["matchupPeriodId"], m["home"]["teamId"], m.get("away", {}).get("teamId")] for m in lg["schedule"]
             if m["matchupPeriodId"] in (cur_mp, cur_mp + 1)]

    keys = ["pts", "reb", "ast", "stl", "blk", "to", "tpm"]
    for tid, t in teams.items():
        roster = sorted([p for p in players if p["t"] == tid], key=lambda p: -value(p))
        contrib = {}
        rest, daily, starts = week_plan(roster, contrib)
        for p in roster:
            p["wk"] = round(contrib.get(p["n"], [0, 0])[0], 1); p["st"] = contrib.get(p["n"], [0, 0])[1]
        top, bench = roster[:len(slots)], roster[len(slots):]
        t.update(live=live.get(tid, 0.0), rest=rest, proj=round(live.get(tid, 0.0) + rest, 1), daily=daily, starts=starts,
                 core=round(sum(value(p) for p in top), 1), bench=round(sum(value(p) for p in bench), 1),
                 risk=sum(1 for p in roster if p["inj"]), star=roster[0]["n"] if roster else "",
                 cat={k: round(sum(p[k] for p in top), 1) for k in keys})
        t["power"] = round(t["core"] + 0.25 * t["bench"] - 2 * t["risk"], 1)
    # Start-of-week baseline: the projection as it stood before the matchup began. Saved once per matchup.
    try:
        wb = json.load(open("weekbase.json"))
    except Exception:
        wb = {}
    if str(cur_mp) not in wb:
        snap = {}
        for tid in teams:
            roster = [p for p in players if p["t"] == tid]
            tot, dl, _ = week_plan(roster, dlist=all_days, live_today=False)
            nm = {p["n"]: p["id"] for p in roster}
            snap[tid] = dict(proj=tot, days={x["iso"]: dict(pts=x["pts"], start=[nm[n] for _, n in x["start"]], pp=x["pp"]) for x in dl})
        wb = {str(cur_mp): dict(at=now_ct.isoformat(), teams=snap)}  # keep only the current matchup
        json.dump(wb, open("weekbase.json", "w"), separators=(",", ":"))
    wk_base = wb[str(cur_mp)]

    # What actually happened each day so far (ESPN's official fantasy points, lineup slot that day)
    act = {}
    def day_actual(d):
        sp = (d - WEEK1_START).days + 1
        j = get(LG, [("view", "mRoster"), ("scoringPeriodId", sp)])
        out = {}
        for t in j.get("teams", []):
            pl, tot = [], 0.0
            for e in t["roster"]["entries"]:
                p = e["playerPoolEntry"]["player"]
                st = next((x for x in p.get("stats", []) if x.get("scoringPeriodId") == sp and x.get("statSourceId") == 0), None)
                if not st: continue
                fp = round(st.get("appliedTotal", 0) or 0, 1)
                slot = SLOT.get(e["lineupSlotId"], "BE")
                pl.append([p["id"], p["fullName"], slot, fp])
                if slot not in ("BE", "IR"): tot += fp
            out[t["id"]] = dict(tot=round(tot, 1), pl=pl)
        return d.isoformat(), out
    try:
        from concurrent.futures import ThreadPoolExecutor as _TP
        with _TP(max_workers=4) as ex:
            for iso, out in ex.map(day_actual, [d for d in all_days if d <= today]):
                act[iso] = out
    except Exception as e:
        print("daily actuals skipped:", e)

    for k in keys:
        order = sorted(teams.values(), key=lambda t: t["cat"][k] if k != "to" else -t["cat"][k], reverse=True)
        for i, t in enumerate(order): t.setdefault("rank", {})[k] = i + 1

    # Pending waiver claims / adds for my team
    pending, claim_add, claim_drop = [], set(), set()
    for tx in lg.get("pendingTransactions", []) or []:
        if tx.get("teamId") != MY_TEAM or tx.get("status") != "PENDING": continue
        adds = [i["playerId"] for i in tx.get("items", []) if i["type"] == "ADD"]
        drops = [i["playerId"] for i in tx.get("items", []) if i["type"] == "DROP"]
        pending.append(dict(type=tx.get("type"), add=adds, drop=drops,
                            when=dt.datetime.fromtimestamp(tx["processDate"] / 1000, TZ).strftime("%a %b %-d, %-I:%M %p") if tx.get("processDate") else ""))
        claim_add.update(adds); claim_drop.update(drops)

    filt = {"players": {"filterStatus": {"value": ["FREEAGENT", "WAIVERS"]}, "limit": 60,
                        "sortAppliedStatTotal": {"sortAsc": False, "sortPriority": 1, "value": f"10{SEASON}"}}}
    fa_raw = get(LG, {"view": "kona_player_info"}, {"x-fantasy-filter": json.dumps(filt)})
    fa = []
    for x in fa_raw.get("players", []):
        p = x["player"]; pj = next((s for s in p.get("stats", []) if s["id"] == f"10{SEASON}"), {})
        inj = p.get("injuryStatus", "ACTIVE"); gd = games.get(p["proTeamId"], set())
        fa.append(dict(id=p["id"], claimed=p["id"] in claim_add, n=p["fullName"], pos=POS.get(p["defaultPositionId"], ""), tm=pro_abbr.get(p["proTeamId"], "FA"),
                       inj="" if inj == "ACTIVE" else inj, av=AVAIL.get(inj, 1.0), pa=round(pj.get("appliedAverage", 0) or 0, 1),
                       el=[SLOT[s] for s in p.get("eligibleSlots", []) if s in (0, 1, 2, 3, 4)],
                       days=[d.isoformat() for d in days if d in gd], cg=0, ca=None))

    # Streaming: best single add/drop for my remaining week, Draymond-style tech risks excluded
    mine = [p for p in players if p["t"] == MY_TEAM]
    base = teams[MY_TEAM]["rest"]
    moves = []
    TECH = {"Draymond Green", "Dillon Brooks"}
    for f in fa[:40]:
        if f["n"] in TECH or f["av"] < 0.85 or not f["days"] or f["claimed"]: continue
        for d in mine:
            if d["inj"] == "OUT" or d["id"] in claim_drop: continue
            trial = [p for p in mine if p is not d] + [f]
            gain = week_plan(trial)[0] - base
            if gain > 3:
                moves.append(dict(add=f["n"], addtm=f["tm"], drop=d["n"], gain=round(gain, 1), games=len(f["days"]),
                                  dropgames=len(d["days"]), dropval=round(value(d), 1)))
    # keep drops that are low-value bench players so we never suggest cutting a core starter
    floor = sorted(value(p) for p in mine)[min(4, len(mine) - 1)]
    moves = [m for m in moves if m["dropval"] <= floor]
    moves.sort(key=lambda m: -m["gain"])
    seen, top_moves = set(), []
    for m in moves:
        if m["add"] in seen or m["drop"] in {x["drop"] for x in top_moves}: continue
        seen.add(m["add"]); top_moves.append(m)
        if len(top_moves) == 3: break

    fa_by_id = {f["id"]: f for f in fa}
    if pending:
        after = [p for p in mine if p["id"] not in claim_drop] + [fa_by_id[i] for i in claim_add if i in fa_by_id]
        teams[MY_TEAM]["if_claims"] = week_plan(after)[0]
        for c in pending:
            c["add"] = [fa_by_id[i]["n"] if i in fa_by_id else str(i) for i in c["add"]]
            c["drop"] = [next((p["n"] for p in mine if p["id"] == i), str(i)) for i in c["drop"]]

    # Latest news for my team and this week's opponent (public ESPN feed)
    my_m = next((m for m in sched if m[0] == cur_mp and MY_TEAM in m[1:]), None)
    opp = (my_m[2] if my_m[1] == MY_TEAM else my_m[1]) if my_m else None
    from concurrent.futures import ThreadPoolExecutor

    def one_news(p):
        try:
            j = requests.get("https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players",
                             params={"limit": 1, "playerId": p["id"]}, headers=HDR, timeout=15).json()
            f = (j.get("feed") or [None])[0]
            if f and (f.get("description") or f.get("headline")):
                return dict(n=p["n"], t=p["t"], inj=p["inj"], date=(f.get("published") or "")[:10],
                            text=(f.get("description") or f.get("headline"))[:240])
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=12) as ex:
        news = [x for x in ex.map(one_news, players) if x]

    # ---- Newsroom: ESPN stories, highlight videos, fantasy notes, optional YouTube highlights ----
    by_id = {p["id"]: p for p in players}
    def rel_of(pids, tids):
        owners = {by_id[i]["t"] for i in pids if i in by_id}
        if MY_TEAM in owners: return "me"
        if opp in owners: return "opp"
        if owners: return "league"
        my_nba = {p["tm"] for p in players if p["t"] == MY_TEAM}
        return "myteams" if any(pro_abbr.get(t) in my_nba for t in tids) else "nba"

    def art(x):
        cats = x.get("categories") or []
        pids = [c.get("athleteId") for c in cats if c.get("type") == "athlete" and c.get("athleteId")]
        tids = [c.get("teamId") for c in cats if c.get("type") == "team" and c.get("teamId")]
        img = next((i.get("url") for i in (x.get("images") or []) if i.get("url")), "")
        return dict(kind="video" if x.get("type") == "Media" else "story", title=x.get("headline", ""), text=(x.get("description") or "")[:260],
                    img=img, url=((x.get("links") or {}).get("web") or {}).get("href", ""), date=x.get("published") or x.get("lastModified") or "",
                    players=[by_id[i]["n"] for i in pids if i in by_id], rel=rel_of(pids, tids), id=x.get("id"))

    feed, seen_ids = [], set()
    def add_articles(url):
        try:
            for x in requests.get(url, headers=HDR, timeout=20).json().get("articles", []):
                if x.get("id") in seen_ids: continue
                seen_ids.add(x.get("id")); feed.append(art(x))
        except Exception:
            pass
    add_articles("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=100")
    my_pro = {p_id for p_id, ab in pro_abbr.items() if ab in {p["tm"] for p in players if p["t"] in (MY_TEAM, opp)}}
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda t: add_articles(f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{t}/news?limit=12"), sorted(my_pro)))
    for n in news:  # fantasy notes (one per rostered player)
        feed.append(dict(kind="note", title=n["n"], text=n["text"], img=f"https://a.espncdn.com/i/headshots/nba/players/full/{next((p['id'] for p in players if p['n']==n['n']), 0)}.png",
                         url="", date=n["date"], players=[n["n"]], rel="me" if n["t"] == MY_TEAM else "opp" if n["t"] == opp else "league", inj=n["inj"]))

    # YouTube highlights (needs YT_API_KEY secret). Cached for 12 hours to stay inside the free daily quota.
    yt_key = os.environ.get("YT_API_KEY", "")
    try:
        cache = json.load(open("highlights.json"))
    except Exception:
        cache = {"at": "", "items": []}
    fresh = cache.get("at") and (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(cache["at"])).total_seconds() < 12 * 3600
    if yt_key and not fresh:
        items = []
        stars = sorted([p for p in players if p["t"] in (MY_TEAM, opp)], key=lambda p: -p["pa"])[:16]
        since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for p in stars:
            try:
                j = requests.get("https://www.googleapis.com/youtube/v3/search", timeout=15, params=dict(
                    key=yt_key, part="snippet", q=f"{p['n']} highlights", type="video", maxResults=1, order="relevance",
                    channelId="UCWJ2lWNubArHWmf3FIHbfcQ", publishedAfter=since, videoEmbeddable="true")).json()
                for v in j.get("items", []):
                    items.append(dict(vid=v["id"]["videoId"], title=v["snippet"]["title"], date=v["snippet"]["publishedAt"],
                                      img=v["snippet"]["thumbnails"].get("high", {}).get("url", ""), player=p["n"],
                                      rel="me" if p["t"] == MY_TEAM else "opp"))
            except Exception:
                pass
        cache = {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "items": items}
        json.dump(cache, open("highlights.json", "w"))
    def names_player(v):
        t = html.unescape(v["title"]).lower(); parts = v["player"].lower().replace(".", "").split()
        return (parts[-1] if parts[-1] not in ("jr", "sr", "ii", "iii") else parts[-2]) in t.replace(".", "")
    for v in [x for x in cache.get("items", []) if names_player(x)]:
        feed.append(dict(kind="yt", title=html.unescape(v["title"]), text="", img=v["img"], url=f"https://www.youtube.com/watch?v={v['vid']}", vid=v["vid"],
                         date=v["date"], players=[v["player"]], rel=v["rel"]))
    feed.sort(key=lambda x: x.get("date") or "", reverse=True)
    news.sort(key=lambda x: (x["t"] != MY_TEAM, not x["inj"], x["date"]), reverse=False)

    for p in players: p["v"] = round(value(p), 1)
    # Today's one-tap lineup plan for my team (fewest moves, locked players skipped)
    now = dt.datetime.now(TZ); plan_day = days[0] if days else today
    tips = {}
    for t in pro["settings"]["proTeams"]:
        for gs in (t.get("proGamesByScoringPeriod") or {}).values():
            for g in gs:
                d = dt.datetime.fromtimestamp(g["date"] / 1000, TZ)
                if d.date() == plan_day: tips[pro_abbr[t["id"]]] = d
    plan = plan_moves([dict(id=p["id"], n=p["n"], slot=p["slot"], el=set(p["el"]) | ({"G"} if {"PG", "SG"} & set(p["el"]) else set()) | ({"F"} if {"SF", "PF"} & set(p["el"]) else set()) | {"UTIL", "BE"},
                            v=value(p), plays=p["tm"] in tips, locked=p["tm"] in tips and now >= tips[p["tm"]] - dt.timedelta(minutes=5))
                       for p in players if p["t"] == MY_TEAM], slots)
    data = dict(pulled=dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT"), pulled_iso=dt.datetime.now(dt.timezone.utc).isoformat(), pending=pending, league=settings["name"], me=MY_TEAM, opp=opp,
                plan=[{k: m[k] for k in ("n", "from", "to", "why")} for m in plan], plan_day=plan_day.strftime("%a %b ") + str(plan_day.day), period=cur_mp, week=[wk_start.isoformat(), wk_end.isoformat()], days=[d.isoformat() for d in days],
                slots=slots, scoring=scoring, teams=teams, base=wk_base, act=act, all_days=[d.isoformat() for d in all_days], players=players, sched=sched, moves=top_moves,
                fa=[{k: f[k] for k in ("n", "pos", "tm", "inj", "pa", "claimed")} | {"g": len(f["days"])} for f in fa[:12]], news=news, feed=feed[:220], yt=bool(os.environ.get("YT_API_KEY")))
    with open("data.json", "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    try:
        season_file(pro_abbr, teams)
    except Exception as e:
        print("season.json skipped:", e)
    me = teams[MY_TEAM]
    print(f"OK {me['name']} live {me['live']} proj {me['proj']} vs {teams[opp]['name'] if opp else '-'}; moves {len(top_moves)}")


def season_file(pro_abbr, teams):
    """season.json: this season's per-game averages for every NBA player with 1+ game, with fantasy owner."""
    filt = {"players": {"limit": 450, "sortAppliedStatTotal": {"sortAsc": False, "sortPriority": 1, "value": f"00{SEASON}"}}}
    raw = get(LG, {"view": "kona_player_info"}, {"x-fantasy-filter": json.dumps(filt)})
    out = []
    for x in raw.get("players", []):
        p = x["player"]
        cur = next((st for st in p.get("stats", []) if st.get("id") == f"00{SEASON}"), None)
        if not cur or not cur.get("appliedAverage"):
            continue
        a, tot = cur.get("averageStats") or {}, cur.get("stats") or {}
        g = lambda d, k: float(d.get(str(k), d.get(k, 0)) or 0)
        gp = round(cur["appliedTotal"] / cur["appliedAverage"]) if cur["appliedAverage"] else int(g(tot, 42))
        if gp < 1:
            continue
        fga, fta = g(tot, 14), g(tot, 16)
        out.append(dict(id=p["id"], n=p["fullName"], tm=pro_abbr.get(p["proTeamId"], "FA"), pos=POS.get(p.get("defaultPositionId"), ""),
                        o=x.get("onTeamId") or 0, gp=gp, min=round(g(a, 40), 1), pts=round(g(a, 0), 1), reb=round(g(a, 6), 1),
                        oreb=round(g(a, 4), 1), ast=round(g(a, 3), 1), stl=round(g(a, 2), 1), blk=round(g(a, 1), 1),
                        tpm=round(g(a, 17), 1), to=round(g(a, 11), 1),
                        fg=round(g(tot, 13) / fga * 100, 1) if fga else None, ft=round(g(tot, 15) / fta * 100, 1) if fta else None,
                        fp=round(cur["appliedAverage"], 1), fpt=round(cur["appliedTotal"], 1),
                        inj="" if p.get("injuryStatus", "ACTIVE") == "ACTIVE" else p.get("injuryStatus")))
    out.sort(key=lambda r: -r["fp"])
    data = dict(pulled=dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT"), season=SEASON,
                teams={k: v["name"] for k, v in teams.items()}, players=out)
    with open("season.json", "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"season.json: {len(out)} players with games")


if __name__ == "__main__":
    if not COOKIES["espn_s2"] or not COOKIES["SWID"]:
        sys.exit("Missing ESPN_S2 / ESPN_SWID secrets")
    main()
