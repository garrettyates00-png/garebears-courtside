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
_ST = None


def standings():
    global _ST
    if _ST is not None:
        return _ST
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
    _ST = out
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
        if y > 41.75: continue  # ESPN measures from the rim; anything past half court is a heave
        part = (p.get("participants") or [{}])[0].get("athlete", {}).get("id")
        desc = (p.get("text", "") + " " + p.get("type", {}).get("text", "")).lower()
        is3 = 1 if ("three point" in desc or "3-pt" in desc or "3pt" in desc) else 0
        shots.append([str(part), round(x, 1), round(y, 1), 1 if p.get("scoringPlay") else 0, p.get("scoreValue", 0),
                      (p.get("period") or {}).get("number", 0), (p.get("team") or {}).get("id"), is3])
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


def build(abbr, full=True):
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
                          shots=[sh[:6] + [sh[7] if len(sh) > 7 else 0] for sh in s["shots"] if sh[6] == tid], oshots=len([1 for sh in s["shots"] if sh[6] != tid]),
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
    # favorites: 3 searches every 3h. Other teams: 1 search a day, to stay inside the YouTube quota.
    stale = not yc.get("at") or (NOW - dt.datetime.fromisoformat(yc["at"])).total_seconds() > (3 if full else 24) * 3600
    if YT and stale:
        try:
            since = (NOW - dt.timedelta(days=45)).strftime("%Y-%m-%dT%H:%M:%SZ")
            items, seen = [], set()
            # newest team-tagged videos from the NBA's channel, then the newest team videos anywhere
            searches = (dict(channelId="UCWJ2lWNubArHWmf3FIHbfcQ", q=team.get("displayName", "")),
                        dict(q=f'"{team.get("displayName", "")}"'), dict(q=f'{team.get("name", "")} highlights House of Highlights'))
            for prm in (searches if full else searches[:1]):
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
    # skip rewriting when nothing but the timestamp changed (keeps the repo small with 30 teams)
    try:
        prev = json.load(open(f"arena/{abbr}.json"))
        same = {k: v for k, v in prev.items() if k not in ("pulled", "pulled_iso")} == {k: v for k, v in data.items() if k not in ("pulled", "pulled_iso")}
    except Exception:
        same = False
    if same:
        print(f"arena {abbr}: unchanged"); return
    json.dump(data, open(f"arena/{abbr}.json", "w"), separators=(",", ":"))
    print(f"arena {abbr}: {len(sched)} games, {len(games)} box scores, {sum(len(g['shots']) for g in games)} shots, "
          f"{len(players)} players, next={nxt and nxt['opp']}, odds={bool(nxt and nxt.get('odds'))}, yt={len(yt)}")


# ---------- league scoreboard fallback for the Season tab (the page normally reads ESPN live) ----------
def _ma(v):
    try:
        m, a = str(v).split("-"); return int(m), int(a)
    except Exception:
        return 0, 0


def scoreboard_file():
    days = {}
    for off in (-1, 0, 1):
        d = (dt.datetime.now(TZ) + dt.timedelta(days=off)).strftime("%Y%m%d")
        try:
            j = get(f"{B}/scoreboard", dates=d, limit=30)
        except Exception as e:
            print("scoreboard:", e); continue
        games, box = [], {}
        for e in j.get("events", []):
            c = e["competitions"][0]; ty = (e.get("status") or c.get("status") or {}).get("type", {})
            def side(h):
                x = next((y for y in c["competitors"] if y.get("homeAway") == h), {}); t = x.get("team", {})
                return dict(abbr=t.get("abbreviation"), name=t.get("displayName"), short=t.get("shortDisplayName") or t.get("name"),
                            logo=t.get("logo") or ((t.get("logos") or [{}])[0].get("href", "")),
                            score=int(num(x.get("score"))) if x.get("score") not in (None, "") else None,
                            rec=((x.get("records") or [{}])[0].get("summary", "")))
            tvn = [n for b in c.get("broadcasts", []) for n in (b.get("names") or [])] + [(b.get("media") or {}).get("shortName") for b in c.get("geoBroadcasts", []) if (b.get("media") or {}).get("shortName")]
            g = dict(id=e["id"], date=e["date"], state=ty.get("state", "pre"), detail=ty.get("shortDetail") or ty.get("detail", ""), home=side("home"), away=side("away"), tv=", ".join(dict.fromkeys(tvn)))
            games.append(g)
            if g["state"] == "pre":
                continue
            try:
                sj = get(f"{B}/summary", event=e["id"])
            except Exception:
                continue
            rows = []
            for tp in (sj.get("boxscore") or {}).get("players", []):
                tm = (tp.get("team") or {}).get("abbreviation", "")
                for st in tp.get("statistics", []):
                    L = [str(x).upper() for x in (st.get("labels") or st.get("names") or [])]
                    for a in st.get("athletes", []):
                        s = a.get("stats") or []
                        gv = lambda k: s[L.index(k)] if k in L and L.index(k) < len(s) else None
                        if a.get("didNotPlay") or not s:
                            rows.append(dict(id=int(a["athlete"]["id"]), n=a["athlete"]["displayName"], tm=tm, dnp=True)); continue
                        fgm, fga = _ma(gv("FG")); tpm, tpa = _ma(gv("3PT")); ftm, fta = _ma(gv("FT"))
                        rows.append(dict(id=int(a["athlete"]["id"]), n=a["athlete"]["displayName"], tm=tm, starter=bool(a.get("starter")),
                                         min=int(num(gv("MIN"))), pts=int(num(gv("PTS"))), reb=int(num(gv("REB"))), oreb=int(num(gv("OREB"))),
                                         ast=int(num(gv("AST"))), stl=int(num(gv("STL"))), blk=int(num(gv("BLK"))), to=int(num(gv("TO"))),
                                         pf=int(num(gv("PF"))), pm=gv("+/-") or "", fgm=fgm, fga=fga, tpm=tpm, tpa=tpa, ftm=ftm, fta=fta))
            box[e["id"]] = rows
        days[d] = dict(games=games, box=box)
    json.dump(dict(pulled=dt.datetime.now(TZ).strftime("%b %-d, %-I:%M %p CT"), days=days), open("arena/scoreboard.json", "w"), separators=(",", ":"))
    print("scoreboard:", {k: len(v["games"]) for k, v in days.items()})


# ---------- report cards: letter grades for every player league-wide ----------
def experience(pid):
    """Years in the league (0 = rookie), cached for a week. None if ESPN doesn't say."""
    path = f"arena/cache/ath_{pid}.json"
    try:
        c = json.load(open(path))
        if (NOW - dt.datetime.fromisoformat(c["at"])).days < 7:
            return c.get("exp")
    except Exception:
        pass
    exp = None
    for url in (f"https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{pid}",
                f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/{pid}"):
        try:
            j = get(url)
            a = j.get("athlete", j)
            e = a.get("experience")
            exp = e.get("years") if isinstance(e, dict) else e
            if exp is not None:
                exp = int(exp); break
        except Exception:
            continue
    json.dump({"at": NOW.isoformat(), "exp": exp}, open(path, "w"))
    return exp


def pct_rank(vals, v):
    if not vals: return 50.0
    below = sum(1 for x in vals if x < v); eq = sum(1 for x in vals if x == v)
    return 100.0 * (below + 0.5 * eq) / len(vals)


LETTERS = [(93, "A+"), (85, "A"), (78, "A-"), (70, "B+"), (62, "B"), (55, "B-"), (48, "C+"), (40, "C"), (33, "C-"), (22, "D"), (0, "F")]


def grades_file():
    """Grade = how a player's production compares with every NBA rotation player this season:
    45% impact per 36 minutes, 25% impact per game (role matters), 30% shooting efficiency adjusted for
    how much of the offense he carries. Rookies get a curve (+5), second-year players +2."""
    allp = []
    for f in os.listdir("arena"):
        if not f.endswith(".json") or "_" in f or f in ("config.json", "scoreboard.json", "grades.json"): continue
        try:
            j = json.load(open(f"arena/{f}"))
        except Exception:
            continue
        for p in j.get("players", []):
            if p.get("gp", 0) >= 1 and p.get("min", 0) >= 8:
                allp.append(dict(p, team=j["team"]["abbr"]))
    if not allp:
        return
    lg_ts = sum(p["ts"] * p["min"] for p in allp) / max(1, sum(p["min"] for p in allp))
    for p in allp:
        p["i36"] = p["impact"] / p["min"] * 36
        p["tsx"] = p["ts"] - (lg_ts - 0.15 * (p.get("usg", 0.2) - 0.2))  # heavy-usage scorers get a little slack
    I36 = [p["i36"] for p in allp]; IPG = [p["impact"] for p in allp]; TSX = [p["tsx"] for p in allp]
    out = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        exps = dict(zip([p["pid"] for p in allp], ex.map(experience, [p["pid"] for p in allp])))
    for p in allp:
        score = .45 * pct_rank(I36, p["i36"]) + .25 * pct_rank(IPG, p["impact"]) + .30 * pct_rank(TSX, p["tsx"])
        exp = exps.get(p["pid"]); curve = 5 if exp == 0 else 2 if exp == 1 else 0
        score = min(100.0, score + curve)
        g = next(l for cut, l in LETTERS if score >= cut)
        why = []
        if pct_rank(I36, p["i36"]) >= 80: why.append("elite production for his minutes")
        elif pct_rank(I36, p["i36"]) <= 25: why.append("not producing much in his minutes")
        if p["tsx"] >= 0.06: why.append(f"very efficient ({round(p['ts'] * 100)}% TS)")
        elif p["tsx"] <= -0.08: why.append(f"inefficient shooting ({round(p['fg'] * 100) if p.get('fg') is not None else round(p['ts'] * 100)}% FG)")
        if curve: why.append("rookie curve" if exp == 0 else "second-year curve")
        if p["gp"] < 4: why.append(f"only {p['gp']} game{'s' if p['gp'] != 1 else ''}")
        out[str(p["pid"])] = dict(g=g, s=round(score), why=why, exp=exp)
    json.dump(dict(at=NOW.isoformat(), lg_ts=round(lg_ts, 3), n=len(allp), grades=out), open("arena/grades.json", "w"), separators=(",", ":"))
    print("grades:", len(out), "players")


def league_teams():
    out = []
    for sp in get(f"{B}/teams").get("sports", []):
        for lg in sp.get("leagues", []):
            for t in lg.get("teams", []):
                t = t["team"]
                out.append(dict(abbr=t["abbreviation"].lower(), name=t.get("displayName", ""), logo=(t.get("logos") or [{}])[0].get("href", "")))
    return sorted(out, key=lambda t: t["name"])


if __name__ == "__main__":
    # config: "fav" teams refresh every run with full YouTube; every other NBA team rotates
    # (missing first, then the oldest few), so each one refreshes every couple of hours.
    try:
        cfg = json.load(open("arena/config.json"))
    except Exception:
        cfg = {}
    fav = [t.lower() for t in cfg.get("fav") or ["mem"]]
    try:
        lt = league_teams()
    except Exception as e:
        print("teams:", e); lt = [dict(abbr=a, name=a.upper(), logo="") for a in fav]
    cfg = {"fav": fav, "teams": [t["abbr"] for t in lt], "names": {t["abbr"]: t["name"] for t in lt},
           "logos": {t["abbr"]: t["logo"] for t in lt}, "rotate": int(cfg.get("rotate", 6))}
    json.dump(cfg, open("arena/config.json", "w"), indent=1)

    def age(a):
        try:
            return json.load(open(f"arena/{a}.json")).get("pulled_iso", "")
        except Exception:
            return ""
    others = [a for a in cfg["teams"] if a not in fav]
    missing = [a for a in others if not os.path.exists(f"arena/{a}.json")]
    rest = sorted([a for a in others if a not in missing], key=age)[: cfg["rotate"]]
    try:
        scoreboard_file()
    except Exception as e:
        print("scoreboard failed:", e)
    for t in fav:
        build(t, True)
    for t in missing + rest:
        try:
            build(t, False)
        except Exception as e:
            print(f"arena {t}: failed {e}")
    try:
        grades_file()
    except Exception as e:
        print("grades failed:", e)
