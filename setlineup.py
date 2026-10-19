"""Set the Garebears' ESPN lineup for today.

Only moves players between starting slots and the bench. Never adds, drops or trades.
Skips any player whose game has already tipped (ESPN locks them).
Writes lineup_log.json so the dashboard can show what changed and why.

Env: ESPN_S2, ESPN_SWID (secrets). DRY_RUN=1 to plan without saving.
"""
import json, os, sys, datetime as dt
from zoneinfo import ZoneInfo
import requests
import numpy as np
from scipy.optimize import linear_sum_assignment

LEAGUE = int(os.environ.get("LEAGUE_ID", "733085335"))
SEASON = int(os.environ.get("SEASON", "2027"))
TEAM = int(os.environ.get("MY_TEAM_ID", "3"))
DRY = os.environ.get("DRY_RUN", "") == "1"
TZ = ZoneInfo("America/Chicago")
OPENING = dt.date(2026, 10, 20)  # ESPN scoring period 1
READ = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{SEASON}"
WRITE = f"https://lm-api-writes.fantasy.espn.com/apis/v3/games/fba/seasons/{SEASON}/segments/0/leagues/{LEAGUE}/transactions/"
SWID = os.environ.get("ESPN_SWID", "")
COOKIES = {"espn_s2": os.environ.get("ESPN_S2", ""), "SWID": SWID}
HDR = {"User-Agent": "Mozilla/5.0 courtside"}
SLOT_ID = {"PG": 0, "SG": 1, "SF": 2, "PF": 3, "C": 4, "G": 5, "F": 6, "UTIL": 11, "BE": 12, "IR": 13}
ID_SLOT = {v: k for k, v in SLOT_ID.items()}
AVAIL = {"OUT": 0.0, "SUSPENSION": 0.0, "INJURY_RESERVE": 0.0, "DAY_TO_DAY": 0.85, "QUESTIONABLE": 0.85, "DOUBTFUL": 0.3}


def log(entry):
    entry["at"] = dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT")
    try:
        hist = json.load(open("lineup_log.json"))
    except Exception:
        hist = []
    hist = [entry] + hist[:29]
    json.dump(hist, open("lineup_log.json", "w"), indent=1)
    print(json.dumps(entry))


def plan_moves(roster, slots):
    """Fewest moves that give the best lineup for today.

    roster: dicts with id, n, slot (slot name), el (set of eligible slot names), v (today's value), plays, locked.
    Starters with no game stay put unless a playing bench player needs their slot.
    Returns moves: dicts with id, n, from, to, why.
    """
    free = list(slots)
    for p in roster:
        if p["locked"] and p["slot"] in free:
            free.remove(p["slot"])
    cands = [p for p in roster if not p["locked"] and p["slot"] != "IR" and ((p["plays"] and p["v"] > 0) or p["slot"] not in ("BE", "IR"))]
    target = {}
    if cands and free:
        M = np.full((len(cands), len(free)), -1e6)
        for i, p in enumerate(cands):
            val = p["v"] if p["plays"] else 0.0
            for j, s in enumerate(free):
                if s in p["el"]:
                    M[i, j] = val + (0.01 if s == p["slot"] else 0.0)
        r, c = linear_sum_assignment(-M)
        for i, j in zip(r, c):
            if M[i, j] > 0:
                target[cands[i]["id"]] = free[j]
    moves = []
    for p in roster:
        if p["locked"] or p["slot"] == "IR":
            continue
        want = target.get(p["id"], "BE")
        if want == p["slot"]:
            continue
        if want == "BE":
            why = "out" if p["plays"] and p["v"] == 0 else "slot needed for a player with a game" if not p["plays"] else "lower projection than today's starters"
        else:
            why = f"plays today ({p['v']:.1f} proj)" if p["plays"] else "shifted to open a slot"
        moves.append(dict(id=p["id"], n=p["n"], **{"from": p["slot"], "to": want}, why=why))
    return moves


def main():
    now = dt.datetime.now(TZ)
    today = now.date()
    period = (today - OPENING).days + 1
    if period < 1:
        period = 1; today = OPENING
    lg = requests.get(f"{READ}/segments/0/leagues/{LEAGUE}", params=[("view", "mRoster"), ("view", "mSettings")],
                      cookies=COOKIES, headers=HDR, timeout=30).json()
    pro = requests.get(READ, params={"view": "proTeamSchedules_wl"}, headers=HDR, cookies=COOKIES, timeout=30).json()
    counts = lg["settings"]["rosterSettings"]["lineupSlotCounts"]
    slots = []
    for sid, n in sorted(counts.items(), key=lambda x: int(x[0])):
        sid = int(sid)
        if sid in ID_SLOT and ID_SLOT[sid] not in ("BE", "IR"):
            slots += [ID_SLOT[sid]] * n

    tip = {}  # proTeamId -> tip-off datetime today
    for t in pro["settings"]["proTeams"]:
        for gs in (t.get("proGamesByScoringPeriod") or {}).values():
            for g in gs:
                d = dt.datetime.fromtimestamp(g["date"] / 1000, TZ)
                if d.date() == today:
                    tip[t["id"]] = d

    team = next(t for t in lg["teams"] if t["id"] == TEAM)
    roster = []
    for e in team["roster"]["entries"]:
        p = e["playerPoolEntry"]["player"]
        st = {s["id"]: s for s in p.get("stats", [])}
        pj, cur = st.get(f"10{SEASON}") or {}, st.get(f"00{SEASON}") or {}
        v = pj.get("appliedAverage", 0) or 0
        if cur.get("appliedAverage"):
            g = cur["appliedTotal"] / cur["appliedAverage"]
            if g >= 5:
                w = min(0.6, g / 25); v = (1 - w) * v + w * cur["appliedAverage"]
        inj = p.get("injuryStatus", "ACTIVE")
        t0 = tip.get(p["proTeamId"])
        roster.append(dict(id=p["id"], n=p["fullName"], slot=e["lineupSlotId"],
                           el={ID_SLOT[s] for s in p["eligibleSlots"] if s in ID_SLOT},
                           v=v * AVAIL.get(inj, 1.0), inj=inj, plays=t0 is not None,
                           locked=t0 is not None and now >= t0 - dt.timedelta(minutes=5)))

    plan = plan_moves([dict(id=p["id"], n=p["n"], slot=ID_SLOT[p["slot"]], el=p["el"], v=p["v"], plays=p["plays"], locked=p["locked"]) for p in roster], slots)
    items = [{"playerId": m["id"], "type": "LINEUP", "fromLineupSlotId": SLOT_ID[m["from"]], "toLineupSlotId": SLOT_ID[m["to"]]} for m in plan]
    notes = [f"{m['n']}: {m['from']} to {m['to']}, {m['why']}" for m in plan]

    if not items:
        log(dict(date=today.isoformat(), status="ok", moved=[], note="Lineup was already optimal."))
        return
    if DRY:
        log(dict(date=today.isoformat(), status="dry-run", moved=notes))
        return
    body = {"isLeagueManager": False, "teamId": TEAM, "type": "ROSTER", "memberId": SWID,
            "scoringPeriodId": period, "executionType": "EXECUTE", "items": items}
    r = requests.post(WRITE, json=body, cookies=COOKIES, headers=dict(HDR, **{"Content-Type": "application/json"}), timeout=30)
    if r.ok:
        log(dict(date=today.isoformat(), status="saved", moved=notes))
    else:
        msg = r.text[:300]
        log(dict(date=today.isoformat(), status="error", moved=notes, error=f"ESPN said {r.status_code}: {msg}"))
        sys.exit(1)


if __name__ == "__main__":
    if not COOKIES["espn_s2"] or not SWID:
        sys.exit("Missing ESPN_S2 / ESPN_SWID secrets")
    main()
