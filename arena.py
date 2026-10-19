"""Arena: deep, live data for a favorite NBA team (default Memphis Grizzlies).

Writes arena/<abbr>.json for each team listed in arena/config.json (default ["mem"]).
Sources: ESPN public site API (schedule, box scores, play-by-play shot locations, odds via
pickcenter, ESPN predictor, standings, news) and, if YT_API_KEY is set, the team's YouTube uploads.
Model picks are graded after each game and kept in arena/picks_<abbr>.json.
"""
import json, os, math, html, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo
import requests

B = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
HDR = {"User-Agent": "Mozilla/5.0 courtside-arena"}
TZ = ZoneInfo("America/Chicago")
NOW = dt.datetime.now(dt.timezone.utc)
YT = os.environ.get("YT_API_KEY", "")
os.makedirs("arena", exist_ok=True)
os.makedirs("arena/cache", exist_ok=True)


def get(url, **params):
    r = requests.get(url, params=params or None, headers=HDR, timeout=30)
    r.raise_for_status()
    return r.json()


def num(v):
    try:
        return float(str(v).replace("+", ""))
    except Exception:
        return 0.0


def phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


# ---------- league context: standings -> team ratings ----------
def standings():
    out = {}
    for season in (None, NOW.year):  # current, then last season as a prior
        try:
            url = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings"
            j = get(url, **({"season": season} if season else {}))
        except Exception:
            continue
        for conf in j.get("children", []):
            for e in conf.get("standings", {}).get("entries", []):
                t = e["team"]; st = {s["name"]: s.get("value") for s in e.get("stats", [])}
                key = "cur" if season is None else "prev"
                gp = (st.get("wins") or 0) + (st.get("losses") or 0)
                diff = st.get("differential") or st.get("pointDifferential") or 0
                rec = out.setdefault(t["id"], {"abbr": t.get("abbreviation", ""), "name": t.get("displayName", ""), "conf": conf.get("abbreviation", conf.get("name", ""))})
                rec[key] = {"w": st.get("wins") or 0, "l": st.get("losses") or 0, "gp": gp,
                            "diff": (diff / gp) if gp and abs(diff) > 30 else diff,  # some feeds give total, some per game
                            "seed": st.get("playoffSeed"), "pf": st.get("avgPointsFor"), "pa": st.get("avgPointsAgainst")}
    pfs = [(r.get("cur") or {}).get("pf") or (r.get("prev") or {}).get("pf") for r in out.values()]
    pfs = [p for p in pfs if p]
    lg = sum(pfs) / len(pfs) if pfs else 113.0
    for tid, r in out.items():
        cur, prev = r.get("cur", {}), r.get("prev", {})
        g = cur.get("gp", 0)
        w = min(1.0, g / 20)  # trust this season more as games pile up
        r["rating"] = round(w * (cur.get("diff") or 0) + (1 - w) * 0.7 * (prev.get("diff") or 0), 2)
        r["ppg"] = cur.get("pf") or prev.get("pf") or lg
        r["oppg"] = cur.get("pa") or prev.get("pa") or lg
    out["_lg"] = lg
    return out


# ---------- one game summary, cached when final ----------
def summary(eid):
    path = f"arena/cache/{eid}.json"
    if os.path.exists(path):
        return json.load(open(path))
    j = get(f"{B}/summary", event=eid)
    comp = (j.get("header", {}).get("competitions") or [{}])[0]
    final = comp.get("status", {}).get("type", {}).get("completed", False)
    out = compact(j)
    if final:
        json.dump(out, open(path, "w"), separators=(",", ":"))
    return out


def split_ma(s):
    try:
        a, b = str(s).split("-"); return int(a), int(b)
    except Exception:
        return 0, 0


def compact(j):
    comp = (j.get("header", {}).get("competitions") or [{}])[0]
    teams = {}
    for c in comp.get("competitors", []):
        t = c.get("team", {})
        teams[t.get("id")] = dict(abbr=t.get("abbreviation"), name=t.get("displayName"), home=c.get("homeAway") == "home",
                                  score=int(num(c.get("score"))), winner=c.get("winner", False),
                                  logo=(t.get("logos") or [{}])[0].get("href") or t.get("logo"))
    box = {}
    for side in (j.get("boxscore", {}).get("players") or []):
        tid = side.get("team", {}).get("id")
        for st in side.get("statistics", []):
            labels = st.get("labels") or st.get("names") or []
            for a in st.get("athletes", []):
                if a.get("didNotPlay") or not a.get("stats"): continue
                v = dict(zip(labels, a["stats"]))
                fgm, fga = split_ma(v.get("FG")); tpm, tpa = split_ma(v.get("3PT")); ftm, fta = split_ma(v.get("FT"))
                ath = a.get("athlete", {})
                box.setdefault(tid, []).append(dict(
                    pid=ath.get("id"), n=ath.get("displayName"), pos=(ath.get("position") or {}).get("abbreviation", ""),
                    hs=(ath.get("headshot") or {}).get("href", ""), st=bool(a.get("starter")),
                    min=num(v.get("MIN")), pts=num(v.get("PTS")), reb=num(v.get("REB")), ast=num(v.get("AST")),
                    stl=num(v.get("STL")), blk=num(v.get("BLK")), to=num(v.get("TO")), pf=num(v.get("PF")),
                    oreb=num(v.get("OREB")), dreb=num(v.get("DREB")), pm=num(v.get("+/-")),
                    fgm=fgm, fga=fga, tpm=tpm, tpa=tpa, ftm=ftm, fta=fta))
    shots = []
    for p in j.get("plays") or []:
        if not p.get("shootingPlay"): continue
        c = p.get("coordinate") or {}
        x, y = c.get("x"), c.get("y")
        if x is None or y is None or not (-1 <= x <= 51 and -1 <= y <= 95): continue
        if "free throw" in (p.get("type", {}).get("text", "") + p.get("text", "")).lower(): continue
        if y > 47: x, y = 50 - x, 94 - y
        part = (p.get("participants") or [{}])[0].get("athlete", {}).get("id")
        shots.append([str(part), round(x, 1), round(y, 1), 1 if p.get("scoringPlay") else 0, p.get("scoreValue", 0),
                      (p.get("period") or {}).get("number", 0), (p.get("team") or {}).get("id")])
    odds = None
    for pc in j.get("pickcenter") or []:
        odds = dict(provider=(pc.get("provider") or {}).get("name", ""), details=pc.get("details", ""), spread=pc.get("spread"),
                    ou=pc.get("overUnder"), home_ml=(pc.get("homeTeamOdds") or {}).get("moneyLine"),
                    away_ml=(pc.get("awayTeamOdds") or {}).get("moneyLine"),
                    home_fav=(pc.get("homeTeamOdds") or {}).get("favorite"))
        if "draft" in odds["provider"].lower(): break
    pred = None
    pr = j.get("predictor") or {}
    if pr.get("homeTeam"):
        pred = dict(home=num(pr["homeTeam"].get("gameProjection")), away=num((pr.get("awayTeam") or {}).get("gameProjection")))
    st = comp.get("status", {}).get("type", {})
    return dict(teams=teams, box=box, shots=shots, odds=odds, pred=pred, final=st.get("completed", False), state=st.get("state"),
                date=comp.get("date"), venue=(j.get("gameInfo", {}).get("venue") or {}).get("fullName", ""))


# ---------- model ----------
def predict(R, home_id, away_id, market_total=None):
    rh, ra = R.get(home_id, {}), R.get(away_id, {})
    margin = (rh.get("rating", 0) - ra.get("rating", 0)) + 2.4  # home court
    lg = R.get("_lg", 113.0)
    # each side scores league average, nudged by its offense and the other side's defense (half weight: early-season noise)
    h_pts = lg + 0.5 * ((rh.get("ppg", lg) - lg) + (ra.get("oppg", lg) - lg))
    a_pts = lg + 0.5 * ((ra.get("ppg", lg) - lg) + (rh.get("oppg", lg) - lg))
    total = h_pts + a_pts
    if market_total:  # anchor to the market's sense of league scoring level, keep our matchup lean
        total = market_total + (total - 2 * lg) * 0.6
    return dict(margin=round(margin, 1), win=round(phi(margin / 12.0), 3), total=round(total, 1))


def ml_profit(ml, stake=100):
    ml = num(ml)
    if not ml: ml = -110
    return stake * (ml / 100 if ml > 0 else 100 / -ml)


def build(abbr):
    team = get(f"{B}/teams/{abbr}")["team"]
    tid = team["id"]
    R = standings()
    sched = []
    for stype in (1, 2, 3):
        try:
            for e in get(f"{B}/teams/{abbr}/schedule", seasontype=stype).get("events", []):
                c = e["competitions"][0]
                us = next((x for x in c["competitors"] if x["team"]["id"] == tid), None)
                th = next((x for x in c["competitors"] if x["team"]["id"] != tid), None)
                if not us or not th: continue
                stt = c.get("status", {}).get("type", {})
                sc = lambda x: int(num((x.get("score") or {}).get("value") if isinstance(x.get("score"), dict) else x.get("score")))
                sched.append(dict(id=e["id"], date=e["date"], stype={1: "Preseason", 2: "Regular season", 3: "Playoffs"}[stype],
                                  home=us.get("homeAway") == "home", opp=th["team"].get("abbreviation"), opp_id=th["team"]["id"],
                                  opp_name=th["team"].get("displayName"), opp_logo=(th["team"].get("logos") or [{}])[0].get("href", ""),
                                  final=stt.get("completed", False), state=stt.get("state"),
                                  us=sc(us) if stt.get("completed") else None, them=sc(th) if stt.get("completed") else None,
                                  tv=", ".join(b.get("media", {}).get("shortName", "") for b in c.get("broadcasts", []) if b.get("media"))))
        except Exception:
            pass
    sched.sort(key=lambda g: g["date"])
    for g in sched:
        if g["final"]: g["res"] = "W" if g["us"] > g["them"] else "L"
    done = [g for g in sched if g["final"]]
    upcoming = [g for g in sched if not g["final"]]

    # Box scores and shots for recent finals (cached), plus the next game's odds and predictor
    recent = done[-12:]
    with ThreadPoolExecutor(max_workers=6) as ex:
        sums = dict(zip([g["id"] for g in recent], ex.map(lambda g: summary(g["id"]), recent)))
    games = []
    for g in recent:
        s = sums[g["id"]]
        games.append(dict(**{k: g[k] for k in ("id", "date", "stype", "home", "opp", "opp_name", "opp_logo", "us", "them", "res")},
                          box=s["box"].get(tid, []), obox=s["box"].get(g["opp_id"], []),
                          shots=[sh[:6] for sh in s["shots"] if sh[6] == tid], oshots=len([1 for sh in s["shots"] if sh[6] != tid]),
                          odds=s.get("odds")))

    nxt = None
    if upcoming:
        g = upcoming[0]
        try:
            s = summary(g["id"])
        except Exception:
            s = {}
        hid, aid = (tid, g["opp_id"]) if g["home"] else (g["opp_id"], tid)
        odds0 = (s or {}).get("odds") or {}
        m = predict(R, hid, aid, num(odds0.get("ou")) or None)
        us_win = m["win"] if g["home"] else 1 - m["win"]
        us_margin = m["margin"] if g["home"] else -m["margin"]
        odds = s.get("odds")
        pick = None
        if odds and odds.get("spread") is not None:
            # ESPN spread is quoted for the home team (negative = home favored)
            home_line = num(odds["spread"])
            us_line = home_line if g["home"] else -home_line
            edge = us_margin + us_line  # >0 means we cover
            side = "us" if edge > 0 else "them"
            tot_edge = m["total"] - num(odds.get("ou")) if odds.get("ou") else 0
            pick = dict(spread=dict(side=side, line=us_line if side == "us" else -us_line, edge=round(abs(edge), 1)),
                        total=dict(side="over" if tot_edge > 0 else "under", line=odds.get("ou"), edge=round(abs(tot_edge), 1)) if odds.get("ou") else None,
                        best="spread" if abs(edge) / 12 >= abs(tot_edge) / 17 else "total")
        espn_pred = s.get("pred")
        nxt = dict(**{k: g[k] for k in ("id", "date", "stype", "home", "opp", "opp_name", "opp_logo", "tv")}, venue=s.get("venue", ""),
                   odds=odds, model=dict(win=round(us_win, 3), margin=round(us_margin, 1), total=m["total"]),
                   espn=(espn_pred["home"] if g["home"] else espn_pred["away"]) / 100 if espn_pred else None, pick=pick,
                   opp_rating=R.get(g["opp_id"], {}).get("rating"), us_rating=R.get(tid, {}).get("rating"),
                   opp_rec=R.get(g["opp_id"], {}).get("cur") or {})

    # Pick log: record a pick before tip, grade it after the final
    log_path = f"arena/picks_{abbr}.json"
    try:
        picks = json.load(open(log_path))
    except Exception:
        picks = []
    if nxt and nxt.get("pick") and nxt["stype"] != "Preseason" and not any(p["id"] == nxt["id"] for p in picks):
        pk = nxt["pick"]; bet = pk[pk["best"]]
        picks.append(dict(id=nxt["id"], date=nxt["date"], opp=nxt["opp"], home=nxt["home"], kind=pk["best"], side=bet["side"],
                          line=bet["line"], edge=bet["edge"], price=-110, made=NOW.isoformat()))
    by_id = {g["id"]: g for g in done}
    for p in picks:
        g = by_id.get(p["id"])
        if not g or p.get("result"): continue
        if p["kind"] == "spread":
            us_margin = g["us"] - g["them"]; m = us_margin if p["side"] == "us" else -us_margin
            v = m + p["line"]
        else:
            tot = g["us"] + g["them"]; v = (tot - p["line"]) if p["side"] == "over" else (p["line"] - tot)
        p["result"] = "W" if v > 0 else "L" if v < 0 else "P"
        p["profit"] = round(ml_profit(p["price"]) if p["result"] == "W" else -100 if p["result"] == "L" else 0, 2)
        p["final"] = f"{g['us']}-{g['them']}"
    json.dump(picks, open(log_path, "w"), indent=1)
    graded = [p for p in picks if p.get("result")]
    record = dict(w=sum(p["result"] == "W" for p in graded), l=sum(p["result"] == "L" for p in graded),
                  p=sum(p["result"] == "P" for p in graded), profit=round(sum(p["profit"] for p in graded), 2), stake=100)

    # Player aggregates (season games first, preseason if season hasn't started)
    season = [g for g in games if g["stype"] != "Preseason"] or games
    agg = {}
    for g in season:
        for b in g["box"]:
            a = agg.setdefault(b["pid"], dict(pid=b["pid"], n=b["n"], pos=b["pos"], hs=b["hs"], gp=0, gs=0, **{k: 0.0 for k in
                               ("min", "pts", "reb", "ast", "stl", "blk", "to", "pf", "oreb", "dreb", "pm", "fgm", "fga", "tpm", "tpa", "ftm", "fta")}))
            a["gp"] += 1; a["gs"] += 1 if b["st"] else 0
            for k in ("min", "pts", "reb", "ast", "stl", "blk", "to", "pf", "oreb", "dreb", "pm", "fgm", "fga", "tpm", "tpa", "ftm", "fta"):
                a[k] += b[k]
    team_min = sum(a["min"] for a in agg.values()) or 1
    team_poss = sum(a["fga"] + 0.44 * a["fta"] + a["to"] for a in agg.values()) or 1
    players = []
    for a in agg.values():
        g = a["gp"] or 1
        ts = a["pts"] / (2 * (a["fga"] + 0.44 * a["fta"])) if a["fga"] + a["fta"] else 0
        efg = (a["fgm"] + 0.5 * a["tpm"]) / a["fga"] if a["fga"] else 0
        usg = ((a["fga"] + 0.44 * a["fta"] + a["to"]) / team_poss) / (a["min"] / team_min) * 0.2 if a["min"] else 0
        stocks = a["stl"] + a["blk"]
        impact = (a["pts"] + 1.2 * a["reb"] + 1.5 * a["ast"] + 3 * stocks - a["to"] + 0.5 * a["pm"]) / g
        players.append(dict(pid=a["pid"], n=a["n"], pos=a["pos"], hs=a["hs"], gp=a["gp"], gs=a["gs"],
                            **{k: round(a[k] / g, 1) for k in ("min", "pts", "reb", "ast", "stl", "blk", "to", "oreb", "dreb", "pm")},
                            fg=round(a["fgm"] / a["fga"], 3) if a["fga"] else 0, tp=round(a["tpm"] / a["tpa"], 3) if a["tpa"] else 0,
                            ft=round(a["ftm"] / a["fta"], 3) if a["fta"] else 0, ts=round(ts, 3), efg=round(efg, 3), usg=round(usg, 3),
                            stocks=round(stocks / g, 1), impact=round(impact, 1), pm_tot=round(a["pm"], 0)))
    players.sort(key=lambda p: -p["impact"])

    # Team profile vs opponents in those games
    def tsum(key, side="box"):
        return sum(sum(b[key] for b in g[side]) for g in season)
    n = len(season) or 1
    tm = dict(gp=len(season), w=sum(g["res"] == "W" for g in season), l=sum(g["res"] == "L" for g in season),
              ppg=round(sum(g["us"] for g in season) / n, 1), oppg=round(sum(g["them"] for g in season) / n, 1))
    tm["net"] = round(tm["ppg"] - tm["oppg"], 1)
    for k in ("reb", "ast", "stl", "blk", "to", "oreb", "dreb"):
        tm[k] = round(tsum(k) / n, 1); tm["o_" + k] = round(tsum(k, "obox") / n, 1)
    fga, fgm, tpa, tpm, fta, ftm = (tsum(k) for k in ("fga", "fgm", "tpa", "tpm", "fta", "ftm"))
    ofga, ofgm, otpm = tsum("fga", "obox"), tsum("fgm", "obox"), tsum("tpm", "obox")
    tm.update(fg=round(fgm / fga, 3) if fga else 0, tp=round(tpm / tpa, 3) if tpa else 0, ft=round(ftm / fta, 3) if fta else 0,
              efg=round((fgm + 0.5 * tpm) / fga, 3) if fga else 0, o_efg=round((ofgm + 0.5 * otpm) / ofga, 3) if ofga else 0)
    poss = fga + 0.44 * fta + tsum("to") - tsum("oreb")
    tm["pace"] = round(poss / n, 1)
    tm["ortg"] = round(100 * sum(g["us"] for g in season) / poss, 1) if poss else 0
    tm["drtg"] = round(100 * sum(g["them"] for g in season) / poss, 1) if poss else 0
    tm["sample"] = "Regular season" if any(g["stype"] != "Preseason" for g in games) else "Preseason"

    # News, ESPN videos, YouTube team uploads
    news, vids = [], []
    try:
        arts = []
        for url, prm in ((f"{B}/news", {"team": tid, "limit": 40}), (f"{B}/teams/{tid}/news", {"limit": 40})):
            try:
                arts = get(url, **prm).get("articles", [])
            except Exception:
                arts = []
            if arts: break
        for x in arts:
            item = dict(title=x.get("headline", ""), text=(x.get("description") or "")[:260],
                        img=next((i.get("url") for i in (x.get("images") or []) if i.get("url")), ""),
                        url=((x.get("links") or {}).get("web") or {}).get("href", ""), date=x.get("published", ""))
            (vids if x.get("type") == "Media" else news).append(item)
    except Exception:
        pass
    yt = []
    ycache = f"arena/yt_{abbr}.json"
    try:
        yc = json.load(open(ycache))
    except Exception:
        yc = {"at": "", "items": []}
    stale = not yc.get("at") or (NOW - dt.datetime.fromisoformat(yc["at"])).total_seconds() > 3 * 3600
    if YT and stale:
        try:
            since = (NOW - dt.timedelta(days=45)).strftime("%Y-%m-%dT%H:%M:%SZ")
            items, seen = [], set()
            # newest team-tagged videos from the NBA's channel, then the newest team videos anywhere
            for prm in (dict(channelId="UCWJ2lWNubArHWmf3FIHbfcQ", q=team.get("displayName", "")),
                        dict(q=f'"{team.get("displayName", "")}"'), dict(q=f'{team.get("name", "")} highlights House of Highlights')):
                j = get("https://www.googleapis.com/youtube/v3/search", part="snippet", type="video", order="date", maxResults=15,
                        publishedAfter=since, videoEmbeddable="true", relevanceLanguage="en", key=YT, **prm)
                for i in j.get("items", []):
                    vid = i["id"].get("videoId"); sn = i["snippet"]
                    title = html.unescape(sn["title"])
                    if not vid or vid in seen: continue
                    if team.get("name", "").lower() not in (title + " " + sn.get("description", "")).lower(): continue
                    official = {"nba", "espn", "house of highlights", "bleacher report", "nba on prime", "nba on tnt", "nba on nbc",
                                team.get("displayName", "").lower(), team.get("name", "").lower()}
                    if sn.get("channelTitle", "").strip().lower() not in official: continue
                    seen.add(vid)
                    items.append(dict(vid=vid, title=title, date=sn["publishedAt"], ch=sn.get("channelTitle", ""),
                                      img=(sn.get("thumbnails", {}).get("high") or {}).get("url", "")))
            items.sort(key=lambda v: v["date"], reverse=True)
            yc = {"at": NOW.isoformat(), "items": items}
            json.dump(yc, open(ycache, "w"))
        except Exception as e:
            print("youtube:", e)
    yt = yc.get("items", [])

    st = R.get(tid, {})
    cur = st.get("cur") or {}
    data = dict(pulled=dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT"), pulled_iso=NOW.isoformat(),
                team=dict(id=tid, abbr=abbr.upper(), name=team.get("displayName"), short=team.get("name"), loc=team.get("location"),
                          color="#" + (team.get("color") or "5d76a9"), alt="#" + (team.get("alternateColor") or "12173f"),
                          logo=(team.get("logos") or [{}])[0].get("href", ""), record=cur and f"{int(cur.get('w', 0))}-{int(cur.get('l', 0))}",
                          seed=int(cur["seed"]) if cur.get("seed") else None, conf=st.get("conf"), rating=st.get("rating")),
                next=nxt, schedule=sched, games=games, players=players, teamstats=tm, picks=picks[-40:], record=record,
                news=news[:20], espn_videos=vids[:12], yt=yt[:24])
    json.dump(data, open(f"arena/{abbr}.json", "w"), separators=(",", ":"))
    print(f"arena {abbr}: {len(sched)} games, {len(games)} box scores, {sum(len(g['shots']) for g in games)} shots, "
          f"{len(players)} players, next={nxt and nxt['opp']}, odds={bool(nxt and nxt.get('odds'))}, yt={len(yt)}")


if __name__ == "__main__":
    try:
        teams = json.load(open("arena/config.json")).get("teams", ["mem"])
    except Exception:
        teams = ["mem"]
    json.dump({"teams": teams}, open("arena/config.json", "w"))
    for t in teams:
        build(t.lower())
