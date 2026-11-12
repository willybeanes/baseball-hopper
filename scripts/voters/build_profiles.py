"""Build voter profiles from BBWAA MVP ballots + the Thibodaux HOF tracker.

Inputs (scripts/voters/data): mvp_bbwaa.json, hof_tracker.json, player_ids.json; aliases.json beside this file.
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


def main():
    aliases = json.loads((HERE / "aliases.json").read_text())
    mvp = json.loads((D / "mvp_bbwaa.json").read_text())
    hof = json.loads((D / "hof_tracker.json").read_text())
    ids = json.loads((D / "player_ids.json").read_text())

    voters = defaultdict(lambda: {"names": Counter(), "mvp": [], "hof": [], "outlets": [], "chapters": []})

    # ---------- MVP ----------
    mvp_awards = []
    for a in mvp["awards"]:
        y, lg = a["year"], a["league"]
        pts, firsts, mentions = Counter(), Counter(), Counter()
        resolved = []
        for b in a["ballots"]:
            picks = []
            for i, raw in enumerate(b["picks"]):
                if not raw:
                    continue
                m = ids["mvp"].get(f"{y}|{lg}|{raw}")
                pid = m["id"] if m else f"?{raw}"
                pname = m["name"] if m else raw
                pts[pid] += MVP_POINTS[i]
                mentions[pid] += 1
                if i == 0:
                    firsts[pid] += 1
                picks.append({"rank": i + 1, "id": m["id"] if m else None, "name": pname})
            resolved.append((b, picks))
        order = sorted(pts, key=lambda p: (-pts[p], -firsts[p]))
        final = {p: i + 1 for i, p in enumerate(order)}
        names = {}
        for _, picks in resolved:
            for p in picks:
                names[p["id"] or f"?{p['name']}"] = p["name"]
        standings = [{"id": p if isinstance(p, int) else None, "name": names.get(p, str(p)), "points": pts[p],
                      "firsts": firsts[p], "rank": final[p]} for p in order]
        mvp_awards.append({"year": y, "league": lg, "url": a["url"], "voters": len(a["ballots"]),
                           "standings": standings[:15]})
        for b, picks in resolved:
            k = voter_key(b["voter"], aliases)
            v = voters[k]
            v["names"][aliases.get(tidy(b["voter"]), tidy(b["voter"]))] += 1
            if b["outlet"]:
                v["outlets"].append((y, b["outlet"]))
            if b["chapter"]:
                v["chapters"].append((y, b["chapter"].replace("*", "").strip()))
            dev = 0
            for p in picks:
                pid = p["id"] or f"?{p['name']}"
                p["finalRank"] = final[pid]
                p["mentions"] = mentions[pid]
                dev += abs(p["rank"] - min(final[pid], 11))
            v["mvp"].append({"year": y, "league": lg, "outlet": b["outlet"], "chapter": b["chapter"],
                             "picks": picks, "winner": standings[0]["name"],
                             "firstMatchesWinner": bool(picks) and (picks[0]["id"] or f"?{picks[0]['name']}") == order[0],
                             "deviation": dev, "solo": [p["name"] for p in picks if p["mentions"] == 1]})

    # MVP deviation percentile within each award (lower = closer to consensus)
    for a in mvp_awards:
        devs = sorted(b["deviation"] for v in voters.values() for b in v["mvp"]
                      if b["year"] == a["year"] and b["league"] == a["league"])
        a["medianDeviation"] = devs[len(devs) // 2]

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

    def mvp_sets(v):
        return {(b["year"], b["league"]): b["picks"] for b in v["mvp"]}

    keys = list(voters)
    dec = {k: hof_decisions(voters[k]) for k in keys}
    mvps = {k: mvp_sets(voters[k]) for k in keys}

    profiles, index = {}, []
    for k in keys:
        v = voters[k]
        name = v["names"].most_common(1)[0][0]
        name = re.sub(r"\s+", " ", name).strip()
        v["mvp"].sort(key=lambda b: (b["year"], b["league"]))
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
        if v["mvp"]:
            summary["mvp"] = {
                "ballots": len(v["mvp"]),
                "firstMatches": sum(1 for b in v["mvp"] if b["firstMatchesWinner"]),
                "avgDeviation": round(sum(b["deviation"] for b in v["mvp"]) / len(v["mvp"]), 1),
                "soloPicks": sum(len(b["solo"]) for b in v["mvp"]),
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
                       "chapter": chapter, "summary": summary, "mvp": v["mvp"], "hof": v["hof"], "similar": similar}
        index.append({"slug": k, "name": name, "outlet": outlet, "chapter": chapter,
                      "hofYears": [b["year"] for b in v["hof"]], "mvpYears": sorted({b["year"] for b in v["mvp"]}),
                      "avgNames": summary.get("hof", {}).get("avgNames")})

    for p in profiles.values():
        for s in p["similar"]:
            s["name"] = profiles[s["slug"]]["name"]

    index.sort(key=lambda r: r["name"].split()[-1].lower())
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    (OUT / "profiles.json").write_text(json.dumps(profiles, ensure_ascii=False, separators=(",", ":")))
    (OUT / "awards.json").write_text(json.dumps({"mvp": mvp_awards, "hof": hof_years,
                                                "committee": COMMITTEE}, ensure_ascii=False, separators=(",", ":")))
    both = sum(1 for p in profiles.values() if p["mvp"] and p["hof"])
    print(f"{len(profiles)} voters ({both} with both MVP and HOF ballots)")


if __name__ == "__main__":
    main()
