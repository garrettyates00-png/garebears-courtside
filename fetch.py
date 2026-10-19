"""Pull the Angel Reese Invitational from ESPN and write data.json for the dashboard.

Needs two cookies from a signed-in ESPN session, passed as environment variables:
  ESPN_S2  and  ESPN_SWID
They live in GitHub Actions secrets, never in this repo.
"""
import json, os, sys, datetime as dt
from zoneinfo import ZoneInfo
import requests
import numpy as np
from scipy.optimize import linear_sum_assignment

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
    lg = get(LG, [("view", v) for v in ["mSettings", "mTeam", "mRoster", "mMatchupScore", "mSchedule", "mStatus"]])
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

    cur_mp = lg["status"]["currentMatchupPeriod"]
    weeks = settings["scheduleSettings"]["matchupPeriods"][str(cur_mp)]
    wk_start, wk_end = week_range(weeks[0])[0], week_range(weeks[-1])[1]
    today = dt.datetime.now(TZ).date()
    first_day = max(today, wk_start)
    days = [first_day + dt.timedelta(days=i) for i in range((wk_end - first_day).days + 1)]
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

    def best(cands):
        if not cands: return 0.0, []
        M = np.full((len(cands), len(slots)), -1e6)
        for i, p in enumerate(cands):
            for j, s in enumerate(slots):
                if fits(p, s): M[i, j] = value(p)
        r, c = linear_sum_assignment(-M)
        out = sorted([(slots[j], cands[i]["n"]) for i, j in zip(r, c) if M[i, j] > 0], key=lambda x: (slots.index(x[0]), x[1]))
        return sum(M[i, j] for i, j in zip(r, c) if M[i, j] > 0), out

    def week_plan(roster):
        tot, daily, starts = 0.0, [], 0
        for d in days:
            ds = d.isoformat()
            cands = [p for p in roster if ds in p["days"] and p["av"] > 0]
            sc, lu = best(cands)
            st = {n for _, n in lu}
            daily.append(dict(day=d.strftime("%a %b ") + str(d.day), iso=ds, pts=round(sc, 1), start=lu,
                              bench=[p["n"] for p in cands if p["n"] not in st]))
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
        rest, daily, starts = week_plan(roster)
        top, bench = roster[:len(slots)], roster[len(slots):]
        t.update(live=live.get(tid, 0.0), rest=rest, proj=round(live.get(tid, 0.0) + rest, 1), daily=daily, starts=starts,
                 core=round(sum(value(p) for p in top), 1), bench=round(sum(value(p) for p in bench), 1),
                 risk=sum(1 for p in roster if p["inj"]), star=roster[0]["n"] if roster else "",
                 cat={k: round(sum(p[k] for p in top), 1) for k in keys})
        t["power"] = round(t["core"] + 0.25 * t["bench"] - 2 * t["risk"], 1)
    for k in keys:
        order = sorted(teams.values(), key=lambda t: t["cat"][k] if k != "to" else -t["cat"][k], reverse=True)
        for i, t in enumerate(order): t.setdefault("rank", {})[k] = i + 1

    # Free agents with projections and remaining games this week
    filt = {"players": {"filterStatus": {"value": ["FREEAGENT", "WAIVERS"]}, "limit": 60,
                        "sortAppliedStatTotal": {"sortAsc": False, "sortPriority": 1, "value": f"10{SEASON}"}}}
    fa_raw = get(LG, {"view": "kona_player_info"}, {"x-fantasy-filter": json.dumps(filt)})
    fa = []
    for x in fa_raw.get("players", []):
        p = x["player"]; pj = next((s for s in p.get("stats", []) if s["id"] == f"10{SEASON}"), {})
        inj = p.get("injuryStatus", "ACTIVE"); gd = games.get(p["proTeamId"], set())
        fa.append(dict(n=p["fullName"], pos=POS.get(p["defaultPositionId"], ""), tm=pro_abbr.get(p["proTeamId"], "FA"),
                       inj="" if inj == "ACTIVE" else inj, av=AVAIL.get(inj, 1.0), pa=round(pj.get("appliedAverage", 0) or 0, 1),
                       el=[SLOT[s] for s in p.get("eligibleSlots", []) if s in (0, 1, 2, 3, 4)],
                       days=[d.isoformat() for d in days if d in gd], cg=0, ca=None))

    # Streaming: best single add/drop for my remaining week, Draymond-style tech risks excluded
    mine = [p for p in players if p["t"] == MY_TEAM]
    base = teams[MY_TEAM]["rest"]
    moves = []
    TECH = {"Draymond Green", "Dillon Brooks"}
    for f in fa[:40]:
        if f["n"] in TECH or f["av"] < 0.85 or not f["days"]: continue
        for d in mine:
            if d["inj"] == "OUT": continue
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

    # Latest news for my team and this week's opponent (public ESPN feed)
    my_m = next((m for m in sched if m[0] == cur_mp and MY_TEAM in m[1:]), None)
    opp = (my_m[2] if my_m[1] == MY_TEAM else my_m[1]) if my_m else None
    news = []
    for p in players:
        if p["t"] not in (MY_TEAM, opp): continue
        try:
            j = requests.get("https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players",
                             params={"limit": 1, "playerId": p["id"]}, headers=HDR, timeout=15).json()
            f = (j.get("feed") or [None])[0]
            if f and (f.get("description") or f.get("headline")):
                news.append(dict(n=p["n"], t=p["t"], inj=p["inj"], date=(f.get("published") or "")[:10],
                                 text=(f.get("description") or f.get("headline"))[:220]))
        except Exception:
            pass
    news.sort(key=lambda x: (x["t"] != MY_TEAM, not x["inj"], x["date"]), reverse=False)

    for p in players: p["v"] = round(value(p), 1)
    data = dict(pulled=dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT"), league=settings["name"], me=MY_TEAM, opp=opp,
                period=cur_mp, week=[wk_start.isoformat(), wk_end.isoformat()], days=[d.isoformat() for d in days],
                slots=slots, scoring=scoring, teams=teams, players=players, sched=sched, moves=top_moves,
                fa=[{k: f[k] for k in ("n", "pos", "tm", "inj", "pa")} | {"g": len(f["days"])} for f in fa[:12]], news=news[:24])
    with open("data.json", "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    me = teams[MY_TEAM]
    print(f"OK {me['name']} live {me['live']} proj {me['proj']} vs {teams[opp]['name'] if opp else '-'}; moves {len(top_moves)}")


if __name__ == "__main__":
    if not COOKIES["espn_s2"] or not COOKIES["SWID"]:
        sys.exit("Missing ESPN_S2 / ESPN_SWID secrets")
    main()
