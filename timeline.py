"""Season timeline for my team: how projections and playoff/title odds move over time, and what moved them.

Each data refresh appends a point (projection this week, team strength, power rank, simulated playoff
and title odds, projected wins) and the events since the last point (adds, drops, trades, injuries).
Run as a script to backfill the whole history from git (every committed data.json since the draft).
"""
import json, math, subprocess, sys
import numpy as np

N_SIMS = 3000


def _bracket_slots(size):
    s = [1]
    while len(s) < size:
        m = len(s) * 2 + 1
        s = [y for x in s for y in (x, m - x)]
    return s


def simulate(d, sim, n=N_SIMS, seed=7):
    """Vectorized season sim (same model as the page's simulator, simplified): returns my playoff %, title %, wins."""
    me = d["me"]
    teams = [int(t) for t in d["teams"]]
    TI = {t: i for i, t in enumerate(teams)}
    NT = len(teams)
    cur = d["period"]
    reg = sim["reg"]; pteams = sim.get("pteams") or 4; rounds = sim.get("rounds") or max(1, math.ceil(math.log2(max(2, pteams))))
    days = {int(k): v for k, v in sim["days"].items()}
    last = reg + rounds
    weeks = [w for w in range(cur + 1, last + 1) if w in days]
    W = len(weeks)
    gpw = sim["gpw"]
    nslots = len(d.get("slots") or []) or 11
    rng = np.random.default_rng(seed)
    score = np.zeros((n, NT, max(W, 1)))
    for ti, t in enumerate(teams):
        ps = sorted([p for p in d["players"] if p["t"] == t], key=lambda p: -((p.get("v") or 0) / (p.get("av") or 1) if (p.get("av") or 0) > 0 else (p.get("pa") or 0)))
        if not ps: continue
        # full-health value: the dashboard's v is discounted by availability (0 when OUT), which would wipe a
        # player out for the whole season; here injuries only cost the weeks they cover
        def full(p):
            av = p.get("av", 1) or 0
            return (p.get("v") or 0) / av if av > 0 else (p.get("pa") or 0)
        v = np.array([full(p) for p in ps], float)
        avail = np.array([p.get("av", 1) if p.get("av", 1) is not None else 1 for p in ps], float)
        out = np.array([p.get("inj") in ("OUT", "INJURY_RESERVE", "SUSPENSION") for p in ps])
        K = np.zeros((len(ps), max(W, 1)))
        active = 15  # active roster limit: IR players only count once they return and take a spot
        for wi, w in enumerate(weeks):
            left = round(nslots * days.get(w, 7) * 0.82); used = 0
            for i, p in enumerate(ps):
                if out[i] and wi < 4: continue
                used += 1
                if used > active: break
                g = (gpw.get(p["tm"]) or {}).get(str(w), 0) or 0
                if wi == 0 and avail[i] < 1: g = round(g * avail[i])  # day-to-day: may miss some of next week
                k = min(g, max(left, 0)); K[i, wi] = k; left -= k
        m = np.clip(1 + 0.12 * rng.standard_normal((n, len(ps))), 0.45, 1.6)
        mv = m * v
        mu = mv @ K
        var = (0.2025 * mv * mv) @ K
        score[:, ti, :] = mu * (1 + 0.09 * rng.standard_normal(mu.shape)) + np.sqrt(var) * rng.standard_normal(mu.shape)
    wins = np.array([[(d["teams"][str(t)].get("w") or 0) + 0.5 * (d["teams"][str(t)].get("ti") or 0) for t in teams]] * n, float)
    pf = np.array([[d["teams"][str(t)].get("pf") or 0 for t in teams]] * n, float)
    sched = [m_ for m_ in (sim.get("sched") or []) if m_[2] is not None]
    # this week: live score + what's left
    cw = np.zeros((n, NT))
    for ti, t in enumerate(teams):
        T = d["teams"][str(t)]; r = T.get("rest") or 0
        sd = math.sqrt((0.12 * r) ** 2 + (T.get("starts") or 0) * (0.45 * (r / max(1, T.get("starts") or 1))) ** 2)
        cw[:, ti] = (T.get("live") or 0) + r + sd * rng.standard_normal(n)
    for w, h, a in sched:
        if w < cur or w > reg or h not in TI or a not in TI: continue
        hi, ai = TI[h], TI[a]
        if w == cur: sh, sa = cw[:, hi], cw[:, ai]
        else:
            wi = weeks.index(w) if w in weeks else None
            if wi is None: continue
            sh, sa = score[:, hi, wi], score[:, ai, wi]
        pf[:, hi] += sh; pf[:, ai] += sa
        wins[:, hi] += (sh > sa) + 0.5 * (sh == sa); wins[:, ai] += (sa > sh) + 0.5 * (sh == sa)
    order = np.lexsort((-pf, -wins), axis=-1) if False else np.argsort(-(wins * 1e6 + pf), axis=1)
    mi = TI[me]
    seed_of_me = np.argmax(order == mi, axis=1)
    po = float(np.mean(seed_of_me < pteams))
    # playoffs: fixed bracket with byes, one matchup period per round
    S = 1
    while S < pteams: S *= 2
    slots = _bracket_slots(S)
    champ = 0
    for s_ in range(n):
        seeds = order[s_, :pteams]
        alive = [seeds[x - 1] if x <= pteams else -1 for x in slots]
        rw = reg + 1
        while len(alive) > 1:
            nxt = []
            for k in range(0, len(alive), 2):
                x, y = alive[k], alive[k + 1]
                if x < 0: nxt.append(y); continue
                if y < 0: nxt.append(x); continue
                wi = weeks.index(rw) if rw in weeks else None
                sx = score[s_, x, wi] if wi is not None else 0; sy = score[s_, y, wi] if wi is not None else 0
                nxt.append(x if sx >= sy else y)
            alive = nxt; rw += 1
        champ += alive[0] == mi
    return dict(po=round(float(po), 4), title=round(float(champ) / n, 4), wins=round(float(np.mean(wins[:, mi])), 2))


def point(d, sim):
    me = str(d["me"]); T = d["teams"]
    pw = sorted(T, key=lambda t: -(T[t].get("power") or 0))
    p = dict(at=d.get("pulled_iso") or "", pulled=d.get("pulled"), period=d.get("period"),
             wk=round(T[me].get("proj") or 0, 1), core=round(T[me].get("core") or 0, 1),
             power=round(T[me].get("power") or 0, 1), prank=pw.index(me) + 1,
             rec=f'{T[me].get("w", 0)}-{T[me].get("l", 0)}')
    try:
        p.update(simulate(d, sim))
    except Exception as e:
        print("timeline sim skipped:", e)
    return p


def roster(d):
    return {str(p["id"]): [p["n"], p.get("inj") or "", round(p.get("v") or 0, 1)] for p in d["players"] if p["t"] == d["me"]}


def events(prev, cur, d_prev, d_cur):
    """What changed on my team between two snapshots."""
    ev = []
    for pid, (n, inj, v) in cur.items():
        if pid not in prev: ev.append(dict(kind="add", n=n, text=f"Added {n} ({v}/g)"))
    for pid, (n, inj, v) in prev.items():
        if pid not in cur: ev.append(dict(kind="drop", n=n, text=f"Dropped {n} ({v}/g)"))
    for pid, (n, inj, v) in cur.items():
        if pid in prev and prev[pid][1] != inj:
            was = prev[pid][1]
            if inj and not was: ev.append(dict(kind="injury", n=n, text=f"{n}: {inj.replace('_', ' ').lower()}"))
            elif was and not inj: ev.append(dict(kind="return", n=n, text=f"{n} healthy again"))
            else: ev.append(dict(kind="injury", n=n, text=f"{n}: {was.replace('_', ' ').lower()} to {inj.replace('_', ' ').lower()}"))
    pc, pp_ = set((d_cur or {}).get("claims") or []), set((d_prev or {}).get("claims") or [])
    for c in sorted(pc - pp_): ev.append(dict(kind="claim", n=c, text=f"Claim placed: {c}"))
    if d_prev and d_prev.get("period") != d_cur.get("period"):
        ev.append(dict(kind="week", n="", text=f"Matchup {d_cur.get('period')} started"))
    return ev


def update(d, sim, path="timeline.json", min_gap_h=2.0):
    """Append the current snapshot (always if something changed on my team, else at most every couple of hours)."""
    try:
        tl = json.load(open(path))
    except Exception:
        tl = {"points": [], "events": [], "last": {}}
    cur = roster(d)
    prev = tl.get("last", {}).get("roster")
    claims = [", ".join(f'{"add" if i["kind"] == "ADD" else "drop"} {i["n"]}' for i in c["items"]) for c in (d.get("league_pending") or []) if c.get("mine")]
    meta = dict(period=d.get("period"), claims=claims)
    ev = events(prev, cur, tl.get("last", {}).get("meta"), meta) if prev is not None else []
    lastp = tl["points"][-1] if tl["points"] else None
    import datetime as _dt
    gap = 99
    if lastp and lastp.get("at") and d.get("pulled_iso"):
        try:
            gap = (_dt.datetime.fromisoformat(d["pulled_iso"]) - _dt.datetime.fromisoformat(lastp["at"])).total_seconds() / 3600
        except Exception:
            pass
    if not ev and gap < min_gap_h:
        return tl
    p = point(d, sim)
    if not tl["points"]: ev = [dict(kind="draft", n="", text="Draft complete")] + ev
    tl["points"].append(p)
    for e in ev:
        e["i"] = len(tl["points"]) - 1; e["at"] = p["at"]; tl["events"].append(e)
    tl["last"] = dict(roster=cur, meta=meta)
    json.dump(tl, open(path, "w"), separators=(",", ":"))
    return tl


if __name__ == "__main__":
    # backfill from git: replay every committed data.json in order, using today's schedule/simulator inputs
    sim = json.load(open("data.json"))["sim"]
    commits = subprocess.run(["git", "log", "--reverse", "--format=%H %cI", "--", "data.json"], capture_output=True, text=True).stdout.split("\n")
    import os
    if os.path.exists("timeline.json"): os.remove("timeline.json")
    for line in filter(None, commits):
        h, when = line.split()
        try:
            d = json.loads(subprocess.run(["git", "show", f"{h}:data.json"], capture_output=True, text=True).stdout)
        except Exception:
            continue
        if "snapshot" in str(d.get("pulled", "")): continue   # the pre-login sample data, not the real league
        if not d.get("pulled_iso"): d["pulled_iso"] = when
        update(d, sim)
    tl = json.load(open("timeline.json"))
    print(len(tl["points"]), "points,", len(tl["events"]), "events")
