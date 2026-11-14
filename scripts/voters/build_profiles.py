"""Build voter profiles from BBWAA award ballots (MVP, Cy Young, ROY, Manager, Reliever) + the Thibodaux HOF tracker.

Inputs (scripts/voters/data): mvp_bbwaa.json, awards_bbwaa.json, hof_tracker.json, player_ids.json; aliases.json beside this file.
Outputs: public/data/voters/index.json (list for /voters) and public/data/voters/profiles.json (one entry per voter).
"""
import json, re, unicodedata
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
D = HERE / "data"
OUT = HERE.parent.parent / "public" / "data" / "voters"
MVP_POINTS = [14, 9, 8, 7, 6, 5, 4, 3, 2, 1]

# BBWAA-ballot candidates later elected by an Era/Veterans committee (year of election).
COMMITTEE = {"Alan Trammell": 2018, "Jack Morris": 2018, "Lee Smith": 2019, "Harold Baines": 2019,
             "Fred McGriff": 2023, "Dave Parker": 2025, "Jeff Kent": 2026}
# Candidates publicly tied to performance-enhancing drugs (suspension, Mitchell Report or BALCO testimony).
PED = {"Barry Bonds", "Roger Clemens", "Sammy Sosa", "Mark McGwire", "Rafael Palmeiro", "Manny Ramírez",
       "Manny Ramirez", "Alex Rodriguez", "Álex Rodríguez", "Gary Sheffield", "Andy Pettitte", "Ryan Braun"}


def ascii_(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def clean_chapter(raw):
    """BBWAA chapter cell -> (code, sub). A "*" before or after the code marks a writer from another city
    voting for a chapter that lacked enough eligible voters; it becomes sub=True. Codes are uppercased
    ("Was" -> "WAS"). "SF/ATH" (2026 Athletics slot) is kept as its own code."""
    if not raw:
        return None, False
    code = raw.replace("*", "").strip().upper()
    return (code or None), "*" in raw


def tidy(name):
    return re.sub(r"\s+", " ", name.replace("*", "")).strip()


def voter_key(name, aliases):
    name = tidy(name)
    n = aliases.get(name, name)
    n = ascii_(n).lower().replace(".", "").replace("'", "")
    toks = re.sub(r"[^a-z ]", " ", n.replace("-", " ")).split()
    toks = [t for i, t in enumerate(toks) if i == 0 or i == len(toks) - 1 or len(t) > 1]
    toks = [t for t in toks if t not in ("jr", "sr", "iii", "ii")]
    return "-".join(toks)


def build_social(rec):
    """data/socials.json record (+ overrides) -> {avatar, links} for the profile page, or None."""
    if not rec:
        return None
    page, bsky = rec.get("page"), rec.get("bluesky")
    x = rec.get("x") or (page or {}).get("x") or (bsky or {}).get("x")
    links = []
    if page:
        links.append({"kind": "page", "label": page["label"], "url": page["url"]})
    if bsky:
        links.append({"kind": "bluesky", "label": "Bluesky", "url": bsky["url"]})
    if x:
        links.append({"kind": "x", "label": "X", "url": f"https://x.com/{x}"})
    avatar = rec.get("avatar") or (page or {}).get("image") or (bsky or {}).get("avatar")
    if not links and not avatar:
        return None
    return {"avatar": avatar, "links": links}


def load_socials():
    """fetch_socials.py output with socials_overrides.json on top: {slug: null} drops a voter,
    {slug: {"bluesky": null, "x": "handle", "avatar": url, "page": {...}}} replaces or removes fields."""
    f = D / "socials.json"
    socials = json.loads(f.read_text()) if f.exists() else {}
    of = HERE / "socials_overrides.json"
    for slug, o in (json.loads(of.read_text()) if of.exists() else {}).items():
        if slug.startswith("_"):
            continue
        if o is None:
            socials.pop(slug, None)
            continue
        rec = socials.setdefault(slug, {})
        for k, val in o.items():
            if val is None:
                rec.pop(k, None)
            else:
                rec[k] = val
    return socials


def write_trends(award_list, hof_years, profiles, index):
    """Small, analysis-ready summary (a few KB) for Claude Chat or anyone else: one row per award-year,
    one row per HOF year, one row per chapter. Lives at /data/voters/trends.json."""
    import datetime, statistics
    awards = []
    for a in award_list:
        t = a.get("_trend", {})
        awards.append({
            "award": a["award"], "year": a["year"], "league": a["league"], "voters": a["voters"],
            "winner": a["standings"][0]["name"] if a["standings"] else None,
            "unanimous": bool(a["standings"]) and a["standings"][0]["firsts"] == a["voters"],
            "medianWarMatch": a.get("medianWarMatch"), "meanWarMatch": t.get("meanWarMatch"),
            "consensusWarMatch": a.get("consensusWarMatch"), "warLeader": t.get("warLeader"),
            "winnerWarRank": t.get("winnerWarRank"), "firstPlaceToWarLeader": t.get("firstPlaceToWarLeader"),
        })
    hof = []
    for hy in hof_years:
        ballots = [b for v in profiles.values() for b in v["hof"] if b["year"] == hy["year"]]
        filled = [b["count"] for b in ballots if not b["blank"]]
        hof.append({
            "year": hy["year"], "publicBallots": hy["publicBallots"], "namedBallots": len(ballots),
            "avgNames": round(statistics.mean(filled), 2) if filled else None,
            "medianNames": statistics.median(filled) if filled else None,
            "fullBallotShare": round(sum(1 for c in filled if c >= 10) / len(filled), 3) if filled else None,
            "blankBallots": sum(1 for b in ballots if b["blank"]),
            "elected": [c["name"] for c in hy["candidates"] if c["elected"]],
            "candidates": len(hy["candidates"]),
        })
    chapters = defaultdict(list)
    for r in index:
        if r.get("chapter") and r.get("warBallots", 0) >= 3 and r.get("warVsField") is not None:
            chapters[r["chapter"]].append(r["warVsField"])
    chapter_rows = sorted(({"chapter": c, "voters": len(v), "avgWarVsField": round(statistics.mean(v), 3)}
                           for c, v in chapters.items()), key=lambda x: -x["avgWarVsField"])
    out = {
        "generated": datetime.date.today().isoformat(),
        "about": {
            "source": "Baseball Hopper Voter Profiles: BBWAA award ballots (bbwaa.com, 2012+), public HOF ballots "
                      "(Ryan Thibodaux's BBHOF Tracker, 2009+), FanGraphs WAR.",
            "warMatch": "A ballot's fWAR weighted by award points, divided by the same for the WAR ballot "
                        "(top N in fWAR among eligible players). 1.0 = as much WAR as the WAR ballot.",
            "winnerWarRank": "The winner's rank in fWAR among eligible players (1 = WAR leader).",
            "firstPlaceToWarLeader": "Share of voters whose first-place pick was the WAR leader.",
            "avgWarVsField": "Chapter average of each voter's mean gap to the median voter (voters with 3+ ballots). "
                             "Each voter counts toward their most recent chapter.",
            "hof": "Public ballots only; the full electorate is larger. avgNames excludes blank ballots.",
            "awardCodes": {"mvp": "MVP", "cy": "Cy Young", "roy": "Rookie of the Year", "mgr": "Manager of the Year",
                           "reliever": "Reliever of the Year"},
            "files": "Per-voter detail: /data/voters/profiles.json (large). Voter list: /data/voters/index.json.",
        },
        "awards": awards,
        "hof": hof,
        "chapters": chapter_rows,
    }
    (OUT / "trends.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


def main():
    aliases = json.loads((HERE / "aliases.json").read_text())
    mvp = json.loads((D / "mvp_bbwaa.json").read_text())
    other = json.loads((D / "awards_bbwaa.json").read_text())
    hof = json.loads((D / "hof_tracker.json").read_text())
    ids = json.loads((D / "player_ids.json").read_text())

    voters = defaultdict(lambda: {"names": Counter(), "awards": [], "hof": [], "outlets": [], "chapters": []})

    # ---------- BBWAA awards (MVP, Cy Young, ROY, Manager, Reliever) ----------
    award_list = []
    fwar = json.loads((D / "fwar.json").read_text()) if (D / "fwar.json").exists() else {}

    def war_pools(y, lg):
        """(eligible pool for this award's WAR ballot, every player's fWAR) as {mlbam: (name, war)}."""
        f = fwar.get(f"{y}|{lg}")
        if not f:
            return None, None
        def merge(*keys):
            out = {}
            for k in keys:
                for pid, (name, war) in f.get(k, {}).items():
                    n, w = out.get(int(pid), (name, 0.0))
                    out[int(pid)] = (n, round(w + war, 2))
            return out
        return merge, merge("bat", "pit")

    def war_scale(code, places):
        if code == "mvp":
            return MVP_POINTS[:places]
        if places == 5:
            return [7, 4, 3, 2, 1]
        if places == 3:
            return [5, 3, 1]
        return list(range(places, 0, -1))

    def add_award(code, y, lg, url, ballots, lookup, results=None):
        places = max(max((i + 1 for i, x in enumerate(b["picks"]) if x), default=0) for b in ballots)
        pts, firsts, mentions, full_to_pid, names = Counter(), Counter(), Counter(), {}, {}
        resolved = []
        for b in ballots:
            picks = []
            for i, raw in enumerate(b["picks"]):
                if not raw:
                    continue
                m = lookup(raw)
                pid = (m["id"] if m and m.get("id") else None) or f"?{m['name'] if m else raw}"
                names[pid] = m["name"] if m else raw
                if m and m.get("full"):
                    full_to_pid[m["full"]] = pid
                if code == "mvp":
                    pts[pid] += MVP_POINTS[i]
                mentions[pid] += 1
                if i == 0:
                    firsts[pid] += 1
                picks.append({"rank": i + 1, "id": m["id"] if m else None, "name": names[pid], "pid": pid})
            resolved.append((b, picks))
        if results:  # official order and points from the page's results table
            order, seen = [], set()
            for r in results:
                pid = full_to_pid.get(r["name"])
                if pid and pid not in seen:
                    order.append(pid)
                    seen.add(pid)
                    pts[pid] = r["points"]
            order += sorted((p for p in mentions if p not in seen), key=lambda p: (-mentions[p], -firsts[p]))
        else:
            order = sorted(pts, key=lambda p: (-pts[p], -firsts[p]))
        final = {p: i + 1 for i, p in enumerate(order)}
        standings = [{"id": p if isinstance(p, int) else None, "name": names[p], "points": pts[p],
                      "firsts": firsts[p], "rank": final[p]} for p in order]
        # WAR ballot: top `places` by fWAR among eligible players (no WAR for managers)
        merge, every = war_pools(y, lg)
        war_ballot, scale, best, elig = None, war_scale(code, places), None, {}
        if merge and code != "mgr":
            pool = {"mvp": ("bat", "pit"), "cy": ("pit",), "roy": ("rbat", "rpit"), "reliever": ("rel",)}[code]
            elig = merge(*pool)
            ranked = sorted(elig.items(), key=lambda kv: -kv[1][1])
            war_rank = {pid: i + 1 for i, (pid, _) in enumerate(ranked)}
            war_ballot = [{"id": pid, "name": n, "war": w} for pid, (n, w) in ranked[:places]]
            best = sum(sc * wb["war"] for sc, wb in zip(scale, war_ballot))

        def war_of(pid):
            # Same pool as the WAR ballot (pitching WAR for Cy Young, etc.); picks outside it (a non-rookie
            # on a ROY ballot, a starter on a reliever ballot) fall back to their total fWAR.
            if not isinstance(pid, int):
                return 0.0
            if war_ballot is not None and pid in elig:
                return elig[pid][1]
            return every.get(pid, ("", 0.0))[1]

        def war_match(ids_in_order):
            if not best or best <= 0:
                return None
            return round(sum(sc * war_of(pid) for sc, pid in zip(scale, ids_in_order)) / best, 3)

        matches = []
        devs = []
        for b, picks in resolved:
            k = voter_key(b["voter"], aliases)
            v = voters[k]
            v["names"][aliases.get(tidy(b["voter"]), tidy(b["voter"]))] += 1
            if b["outlet"]:
                v["outlets"].append((y, b["outlet"]))
            chapter, chapter_sub = clean_chapter(b["chapter"])
            if chapter:
                v["chapters"].append((y, chapter))
            dev = 0
            for p in picks:
                pid = p.pop("pid")
                p["finalRank"] = final[pid]
                p["mentions"] = mentions[pid]
                dev += abs(p["rank"] - min(final[pid], places + 1))
                if war_ballot is not None:
                    p["war"] = war_of(p["id"]) if p["id"] else None
                    p["warRank"] = war_rank.get(p["id"]) if p["id"] else None
            devs.append(dev)
            wm = wo = None
            if war_ballot is not None:
                slots = [None] * places
                for p in picks:
                    slots[p["rank"] - 1] = p["id"]
                wm = war_match(slots)
                wb_ids = {x["id"] for x in war_ballot}
                wo = sum(1 for p in picks if p["id"] in wb_ids)
                if wm is not None:
                    matches.append(wm)
            v["awards"].append({"award": code, "year": y, "league": lg, "places": places, "outlet": b["outlet"],
                                "chapter": chapter, "chapterSub": chapter_sub, "picks": picks, "winner": standings[0]["name"],
                                "firstMatchesWinner": bool(picks) and picks[0]["finalRank"] == 1,
                                "deviation": dev, "solo": [p["name"] for p in picks if p["mentions"] == 1],
                                "warMatch": wm, "warOverlap": wo})
        devs.sort()
        matches.sort()
        med = matches[len(matches) // 2] if matches else None
        consensus = war_match([p for p in order[:places]]) if war_ballot is not None else None
        trend_extra = {}
        if war_ballot is not None:
            war1 = war_ballot[0]["id"] if war_ballot else None
            firsts_on_war1 = sum(1 for _, picks in resolved if picks and picks[0]["id"] == war1)
            trend_extra = {
                "meanWarMatch": round(sum(matches) / len(matches), 3) if matches else None,
                "winnerWarRank": war_rank.get(order[0]) if isinstance(order[0], int) else None,
                "warLeader": war_ballot[0]["name"] if war_ballot else None,
                "firstPlaceToWarLeader": round(firsts_on_war1 / len(resolved), 3) if resolved else None,
            }
        award_list.append({"award": code, "year": y, "league": lg, "url": url, "voters": len(ballots),
                           "places": places, "medianDeviation": devs[len(devs) // 2], "standings": standings[:15],
                           "warBallot": war_ballot, "medianWarMatch": med, "consensusWarMatch": consensus,
                           "_trend": trend_extra})

    for a in mvp["awards"]:
        y, lg = a["year"], a["league"]
        add_award("mvp", y, lg, a["url"], a["ballots"], lambda raw, y=y, lg=lg: ids["mvp"].get(f"{y}|{lg}|{raw}"))
    for a in other["awards"]:
        c, y, lg = a["award"], a["year"], a["league"]
        add_award(c, y, lg, a["url"], a["ballots"],
                  lambda raw, c=c, y=y, lg=lg: ids["awards"].get(f"{c}|{y}|{lg}|{raw}"), a["results"])

    # ---------- HOF ----------
    hof_years = []
    for yr in hof["years"]:
        y = yr["year"]
        public = [b for b in yr["ballots"]]
        n = len(public)
        share = Counter(c for b in public for c in b["votes"])
        cands = []
        for c in yr["candidates"]:
            name = c["name"]
            res = yr["results"].get(name)
            pid = (ids["hof"].get(name) or {}).get("id")
            elected_now = res is not None and res >= 0.75
            cands.append({"name": name, "id": pid, "ballotYear": c["ballotYear"], "result": res,
                          "publicShare": round(share[name] / n, 4) if n else None, "elected": elected_now,
                          "ped": name in PED})
        hof_years.append({"year": y, "publicBallots": n, "candidates": cands})
    elected_year = {}
    for hy in hof_years:
        for c in hy["candidates"]:
            if c["elected"]:
                elected_year.setdefault(c["name"], hy["year"])
    for hy in hof_years:
        for c in hy["candidates"]:
            if c["name"] in elected_year:
                c["inducted"] = "BBWAA"
            elif c["name"] in COMMITTEE:
                c["inducted"] = "Committee"
            else:
                c["inducted"] = None

    hy_by_year = {hy["year"]: hy for hy in hof_years}
    for yr in hof["years"]:
        y = yr["year"]
        hy = hy_by_year[y]
        for b in yr["ballots"]:
            if b["anonymous"]:
                continue
            k = voter_key(b["voter"], aliases)
            v = voters[k]
            v["names"][aliases.get(tidy(b["voter"]), tidy(b["voter"]))] += 1
            votes = set(b["votes"])
            electees = [c["name"] for c in hy["candidates"] if c["elected"]]
            v["hof"].append({"year": y, "votes": b["votes"], "count": len(b["votes"]), "blank": b["blank"],
                             "released": b["released"], "source": b["source"], "note": b["note"], "url": b["url"],
                             "electeesBacked": sum(1 for e in electees if e in votes), "electees": len(electees),
                             "rare": [c["name"] for c in hy["candidates"]
                                      if c["name"] in votes and (c["publicShare"] or 0) < 0.05]})

    # ---------- per-voter summaries + similarity ----------
    def hof_decisions(v):
        d = {}
        for b in v["hof"]:
            if b["blank"]:
                continue
            for c in hy_by_year[b["year"]]["candidates"]:
                d[(b["year"], c["name"])] = c["name"] in b["votes"]
        return d

    keys = list(voters)
    dec = {k: hof_decisions(voters[k]) for k in keys}

    med_war = {(a["award"], a["year"], a["league"]): a["medianWarMatch"] for a in award_list}
    profiles, index = {}, []
    for k in keys:
        v = voters[k]
        name = v["names"].most_common(1)[0][0]
        name = re.sub(r"\s+", " ", name).strip()
        v["awards"].sort(key=lambda b: (b["award"], b["year"], b["league"]))
        v["hof"].sort(key=lambda b: b["year"])
        outlet = sorted(v["outlets"])[-1][1] if v["outlets"] else None
        outlet_year = sorted(v["outlets"])[-1][0] if v["outlets"] else None
        chapter = sorted(v["chapters"])[-1][1] if v["chapters"] else None

        filled = [b for b in v["hof"] if not b["blank"]]
        summary = {}
        if filled:
            peds = [(b["year"], c) for b in filled for c in hy_by_year[b["year"]]["candidates"] if c["ped"]]
            ped_yes = sum(1 for y, c in peds if c["name"] in next(x["votes"] for x in filled if x["year"] == y))
            ped_avg = sum((c["publicShare"] or 0) for _, c in peds)
            el = sum(b["electees"] for b in filled)
            summary["hof"] = {
                "ballots": len(v["hof"]),
                "blank": len(v["hof"]) - len(filled),
                "avgNames": round(sum(b["count"] for b in filled) / len(filled), 2),
                "fullBallots": sum(1 for b in filled if b["count"] >= 10),
                "electeeRate": round(sum(b["electeesBacked"] for b in filled) / el, 3) if el else None,
                "pedRate": round(ped_yes / len(peds), 3) if peds else None,
                "pedPublicRate": round(ped_avg / len(peds), 3) if peds else None,
                "rareVotes": sum(len(b["rare"]) for b in filled),
            }
            # avg names on all public ballots in the same years, for context
            tot = cnt = 0
            for b in filled:
                hy = hy_by_year[b["year"]]
                tot += sum((c["publicShare"] or 0) for c in hy["candidates"])
                cnt += 1
            summary["hof"]["peerAvgNames"] = round(tot / cnt, 2) if cnt else None
        if v["awards"]:
            wb = [b for b in v["awards"] if b.get("warMatch") is not None]
            for b in wb:
                b["warVsField"] = round(b["warMatch"] - med_war[(b["award"], b["year"], b["league"])], 3)
            by = defaultdict(list)
            for b in v["awards"]:
                by[b["award"]].append(b)
            summary["awards"] = {
                "ballots": len(v["awards"]),
                "firstMatches": sum(1 for b in v["awards"] if b["firstMatchesWinner"]),
                "soloPicks": sum(len(b["solo"]) for b in v["awards"]),
                "warBallots": len(wb),
                "warMatch": round(sum(b["warMatch"] for b in wb) / len(wb), 3) if wb else None,
                "warVsField": round(sum(b["warVsField"] for b in wb) / len(wb), 3) if wb else None,
                "warOverlap": round(sum(b["warOverlap"] / b["places"] for b in wb) / len(wb), 3) if wb else None,
                "byAward": {c: {"ballots": len(bs), "firstMatches": sum(1 for b in bs if b["firstMatchesWinner"]),
                                "avgDeviation": round(sum(b["deviation"] for b in bs) / len(bs), 1),
                                "warMatch": (round(sum(b["warMatch"] for b in bs if b.get("warMatch") is not None)
                                                   / max(1, sum(1 for b in bs if b.get("warMatch") is not None)), 3)
                                             if any(b.get("warMatch") is not None for b in bs) else None)}
                            for c, bs in by.items()},
            }

        # similar voters: HOF agreement on shared yes/no decisions (>= 20 shared), MVP overlap otherwise
        sims = []
        mine = dec[k]
        my_years = {y for y, _ in mine}
        if len(my_years) >= 3:
            for o in keys:
                if o == k:
                    continue
                shared = mine.keys() & dec[o].keys()
                if len({y for y, _ in shared}) < 3:  # one or two ballots in common says little
                    continue
                agree = sum(1 for s in shared if mine[s] == dec[o][s])
                sims.append((agree / len(shared), len(shared), o, "hof"))
        sims.sort(key=lambda s: (-s[0], -s[1]))
        similar = [{"slug": o, "agree": round(a, 3), "shared": n, "kind": kind} for a, n, o, kind in sims[:5]]

        profiles[k] = {"slug": k, "name": name, "aliases": sorted(set(v["names"]) - {name}), "outlet": outlet,
                       "outletYear": outlet_year,
                       "chapter": chapter, "summary": summary, "awards": v["awards"], "hof": v["hof"], "similar": similar}
        index.append({"slug": k, "name": name, "outlet": outlet, "chapter": chapter,
                      "hofYears": [b["year"] for b in v["hof"]], "awardBallots": len(v["awards"]),
                      "awardYears": sorted({b["year"] for b in v["awards"]}),
                      "awardCodes": sorted({b["award"] for b in v["awards"]}),
                      "avgNames": summary.get("hof", {}).get("avgNames"),
                      "warMatch": summary.get("awards", {}).get("warMatch"),
                      "warVsField": summary.get("awards", {}).get("warVsField"),
                      "warBallots": summary.get("awards", {}).get("warBallots", 0)})

    # WAR alignment percentile among voters with 3+ WAR-comparable award ballots (by average gap to the field)
    ranked = sorted((p for p in profiles.values() if p["summary"].get("awards", {}).get("warBallots", 0) >= 3),
                    key=lambda p: p["summary"]["awards"]["warVsField"])
    for i, p in enumerate(ranked):
        p["summary"]["awards"]["warPercentile"] = round(100 * i / max(1, len(ranked) - 1))
        p["summary"]["awards"]["warPool"] = len(ranked)
    for r in index:
        a = profiles[r["slug"]]["summary"].get("awards", {})
        r["warPercentile"] = a.get("warPercentile")

    socials = load_socials()
    for p in profiles.values():
        p["social"] = build_social(socials.get(p["slug"]))
        for s in p["similar"]:
            s["name"] = profiles[s["slug"]]["name"]

    index.sort(key=lambda r: r["name"].split()[-1].lower())
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    (OUT / "profiles.json").write_text(json.dumps(profiles, ensure_ascii=False, separators=(",", ":")))
    write_trends(award_list, hof_years, profiles, index)
    for a in award_list:
        a.pop("_trend", None)
    (OUT / "awards.json").write_text(json.dumps({"awards": award_list, "hof": hof_years,
                                                "committee": COMMITTEE}, ensure_ascii=False, separators=(",", ":")))
    both = sum(1 for p in profiles.values() if p["awards"] and p["hof"])
    print(f"{len(profiles)} voters ({both} with both award and HOF ballots), {len(award_list)} award-years")


if __name__ == "__main__":
    main()
