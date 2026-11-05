"""Add / drop / IR moves for the Garebears from the dashboard (roster.yml).

Env: ESPN_S2, ESPN_SWID (secrets) and from the dashboard:
  ADD_ID   player to add (free agent: instant; on waivers: a claim that processes later)
  DROP_ID  player to drop (optional when there's an open roster spot)
  IR_ID    OUT player to move to IR first, to open a spot (optional)
Checks everything against ESPN right before saving. Writes roster_log.json for the dashboard.
"""
import json, os, sys, datetime as dt
from zoneinfo import ZoneInfo
import requests

LEAGUE = int(os.environ.get("LEAGUE_ID", "733085335"))
SEASON = int(os.environ.get("SEASON", "2027"))
TEAM = int(os.environ.get("MY_TEAM_ID", "3"))
TZ = ZoneInfo("America/Chicago")
OPENING = dt.date(2026, 10, 20)
READ = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{SEASON}/segments/0/leagues/{LEAGUE}"
WRITE = f"https://lm-api-writes.fantasy.espn.com/apis/v3/games/fba/seasons/{SEASON}/segments/0/leagues/{LEAGUE}/transactions/"
SWID = os.environ.get("ESPN_SWID", "")
COOKIES = {"espn_s2": os.environ.get("ESPN_S2", ""), "SWID": SWID}
HDR = {"User-Agent": "Mozilla/5.0 courtside"}
IR_OK = ("OUT", "INJURY_RESERVE")


def log(entry):
    entry["at"] = dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT")
    try:
        hist = json.load(open("roster_log.json"))
    except Exception:
        hist = []
    json.dump([entry] + hist[:29], open("roster_log.json", "w"), indent=1)
    print(json.dumps(entry))


def post(body):
    r = requests.post(WRITE, json=body, cookies=COOKIES, headers=dict(HDR, **{"Content-Type": "application/json"}), timeout=30)
    return r.ok, f"ESPN said {r.status_code}: {r.text[:300]}"


def main():
    req = os.environ.get("REQ_ID", "")
    add = int(os.environ.get("ADD_ID") or 0); drop = int(os.environ.get("DROP_ID") or 0); ir = int(os.environ.get("IR_ID") or 0)
    base = dict(req=req, add=add or None, drop=drop or None, ir=ir or None)
    if not (add or drop):
        log(dict(base, status="error", error="Nothing to do.")); return
    period = max(1, (dt.datetime.now(TZ).date() - OPENING).days + 1)
    lg = requests.get(READ, params=[("view", "mRoster"), ("view", "mSettings"), ("scoringPeriodId", period)], cookies=COOKIES, headers=HDR, timeout=30).json()
    counts = {int(k): v for k, v in lg["settings"]["rosterSettings"]["lineupSlotCounts"].items()}
    team = next(t for t in lg["teams"] if t["id"] == TEAM)
    roster = {e["playerId"]: e for e in team["roster"]["entries"]}
    name = lambda e: e["playerPoolEntry"]["player"]["fullName"]
    names = {}
    problems = []
    if drop and drop not in roster: problems.append("the player to drop isn't on your roster")
    if ir and ir not in roster: problems.append("the player for IR isn't on your roster")
    if ir and ir in roster:
        e = roster[ir]; names["ir"] = name(e)
        if e["playerPoolEntry"]["player"].get("injuryStatus") not in IR_OK: problems.append(f"{name(e)} isn't listed OUT, so he can't go on IR")
        if sum(1 for x in roster.values() if x["lineupSlotId"] == 13) >= counts.get(13, 0): problems.append("both IR spots are full")
    status = None
    if add:
        info = requests.get(READ, params={"view": "kona_player_info"}, headers=dict(HDR, **{"x-fantasy-filter": json.dumps({"players": {"filterIds": {"value": [add]}}})}),
                            cookies=COOKIES, timeout=30).json().get("players", [])
        x = info[0] if info else None
        if not x: problems.append("couldn't find the player to add")
        else:
            names["add"] = x["player"]["fullName"]; status = x.get("status")
            if x.get("onTeamId"): problems.append(f"{names['add']} is already on a team")
    if drop and drop in roster: names["drop"] = name(roster[drop])
    # roster room: active spots = everything but IR
    active_max = sum(v for k, v in counts.items() if k != 13)
    active = sum(1 for x in roster.values() if x["lineupSlotId"] != 13)
    after = active - (1 if ir else 0) + (1 if add else 0) - (1 if drop and roster.get(drop, {}).get("lineupSlotId") != 13 else 0)
    if after > active_max: problems.append(f"no room: that would be {after} active players (max {active_max}). Pick someone to drop or move an OUT player to IR")
    base.update(names=names)
    if problems:
        log(dict(base, status="error", error="; ".join(problems))); return
    if ir:
        ok, msg = post({"isLeagueManager": False, "teamId": TEAM, "type": "ROSTER", "memberId": SWID, "scoringPeriodId": period, "executionType": "EXECUTE",
                        "items": [{"playerId": ir, "type": "LINEUP", "fromLineupSlotId": roster[ir]["lineupSlotId"], "toLineupSlotId": 13}]})
        if not ok:
            log(dict(base, status="error", error="Moving to IR failed. " + msg)); return
    items = []
    if add: items.append({"playerId": add, "type": "ADD", "fromTeamId": 0, "toTeamId": TEAM})
    if drop: items.append({"playerId": drop, "type": "DROP", "fromTeamId": TEAM, "toTeamId": 0})
    kind = "WAIVER" if add and status == "WAIVERS" else "FREEAGENT"
    body = {"isLeagueManager": False, "teamId": TEAM, "type": kind, "memberId": SWID, "scoringPeriodId": period, "executionType": "EXECUTE", "items": items}
    if kind == "WAIVER": body["bidAmount"] = 0
    ok, msg = post(body)
    if ok:
        log(dict(base, status="claim" if kind == "WAIVER" else "done", kind=kind))
    else:
        log(dict(base, status="error", kind=kind, error=msg + (" (the IR move went through)" if ir else "")))


if __name__ == "__main__":
    if not COOKIES["espn_s2"] or not SWID:
        sys.exit("Missing ESPN_S2 / ESPN_SWID secrets")
    main()
