"""Match MVP ballot names and HOF candidate names to MLBAM ids.

MVP: surname (or nickname) against that season's league players (MLB Stats API), most playing time wins.
HOF: full-name people search, picking the player whose career ended closest to ballot eligibility.
overrides.json wins over both. Writes data/player_ids.json and prints anything uncertain.
"""
import difflib, json, re, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

D = Path(__file__).parent / "data"
API = "https://statsapi.mlb.com/api/v1"
LEAGUE = {"AL": 103, "NL": 104}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "baseball-hopper"}), timeout=30) as r:
        return json.load(r)


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii)\b\.?", "", s)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", "", s.replace("-", " ").replace(".", " "))).strip()


BR_CACHE = D / "br_mvp_votes.json"


def br_vote_getters():
    """Full names of every MVP vote-getter by year/league, from Baseball-Reference award pages (cached)."""
    cache = json.loads(BR_CACHE.read_text()) if BR_CACHE.exists() else {}
    for y in range(2012, 2026):
        if all(f"{y}|{lg}" in cache for lg in ("AL", "NL")):
            continue
        req = urllib.request.Request(f"https://www.baseball-reference.com/awards/awards_{y}.shtml",
                                     headers={"User-Agent": "Mozilla/5.0"})
        page = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
        for lg in ("AL", "NL"):
            i = page.find(f'id="{lg}_MVP_voting"')
            seg = page[i:]
            seg = seg[: seg.find("</table>")]
            cache[f"{y}|{lg}"] = [n for _, n in re.findall(r'data-append-csv="([^"]+)"[^>]*><a href="[^"]+">([^<]+)</a>', seg)]
        time.sleep(4)  # Baseball-Reference rate limit
    BR_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    return cache


def season_pool(year, lg):
    pool = {}
    for group, key in (("hitting", "plateAppearances"), ("pitching", "battersFaced")):
        d = get(f"{API}/stats?stats=season&group={group}&season={year}&leagueId={LEAGUE[lg]}&playerPool=all&limit=3000"
                f"&fields=stats,splits,player,id,fullName,lastName,stat,{key}")
        for s in d["stats"][0]["splits"]:
            p = s["player"]
            e = pool.setdefault(p["id"], {"id": p["id"], "name": p["fullName"], "last": p["lastName"], "pt": 0})
            e["pt"] += s["stat"].get(key, 0) or 0
    return list(pool.values())


def main():
    ov = json.loads((Path(__file__).parent / "overrides.json").read_text())
    mvp = json.loads((D / "mvp_bbwaa.json").read_text())
    hof = json.loads((D / "hof_tracker.json").read_text())
    other = json.loads((D / "awards_bbwaa.json").read_text())
    out = {"mvp": {}, "hof": {}}
    br = br_vote_getters()
    flags = []

    pools = {}

    def pool_for(y, lg):
        if (y, lg) not in pools:
            pools[(y, lg)] = season_pool(y, lg)
        return pools[(y, lg)]

    def last_of(full):
        return norm(full).split()[-1] if norm(full).split() else ""

    def resolve(tag, key, raw, vg, pool):
        """Ballot string -> one vote-getter's full name -> MLBAM player. pool=None: name only (managers)."""
        n = norm(raw)
        parts = n.replace("jr", "").split()
        cands = [f for f in vg if norm(f) == n or last_of(f) == (parts[-1] if parts else n)
                 or " ".join(norm(f).split()[1:]) == n]
        if len(cands) > 1 and len(parts) > 1:
            cands = [f for f in cands if norm(f).startswith(parts[0][0])] or cands
        if not cands:
            close = difflib.get_close_matches(parts[-1] if parts else n, [last_of(f) for f in vg], n=1, cutoff=0.8)
            cands = [f for f in vg if close and last_of(f) == close[0]]
        if len(cands) != 1:
            flags.append((tag, "MULTI" if cands else "NO MATCH", key, cands))
            return None
        if pool is None:
            return {"id": None, "name": cands[0], "full": cands[0]}
        full = norm(cands[0])
        hits = [p for p in pool if norm(p["name"]) == full]
        if not hits:
            fp = full.split()
            hits = [p for p in pool if norm(p["last"]).split()[-1:] == fp[-1:] and norm(p["name"])[:1] == fp[0][:1]]
        hits.sort(key=lambda p: -p["pt"])
        if len(hits) > 1:
            flags.append((tag, "AMBIG", key, cands[0], [(h["name"], h["id"]) for h in hits[:3]]))
        if not hits:
            flags.append((tag, "NO PLAYER ID", key, cands[0]))
            return {"id": None, "name": cands[0], "full": cands[0]}
        return {"id": hits[0]["id"], "name": hits[0]["name"], "full": cands[0]}

    for a in mvp["awards"]:
        y, lg = a["year"], a["league"]
        for raw in sorted({p for b in a["ballots"] for p in b["picks"] if p}):
            key = f"{y}|{lg}|{raw}"
            o = ov["mvp"].get(key) or ov["mvp"].get(raw)
            r = o or resolve("MVP", key, raw, br.get(f"{y}|{lg}", []), pool_for(y, lg))
            if r:
                out["mvp"][key] = r
        print("mvp", y, lg, file=sys.stderr)

    out["awards"] = {}
    for a in other["awards"]:
        code, y, lg = a["award"], a["year"], a["league"]
        vg = [r["name"] for r in a["results"]]
        for raw in sorted({p for b in a["ballots"] for p in b["picks"] if p}):
            key = f"{code}|{y}|{lg}|{raw}"
            o = ov.get("awards", {}).get(key)
            r = o or resolve(code.upper(), key, raw, vg, None if code == "mgr" else pool_for(y, lg))
            if r:
                out["awards"][key] = r
        print(code, y, lg, file=sys.stderr)

    seen = {}
    for yr in hof["years"]:
        for c in yr["candidates"]:
            name = c["name"]
            if name in seen:
                continue
            o = ov["hof"].get(name)
            if o:
                seen[name] = o
                continue
            # expected last season ~ year - 6 - (ballotYear - 1)
            target = yr["year"] - 6 - ((c["ballotYear"] or 1) - 1)
            ppl = get(f"{API}/people/search?names={urllib.parse.quote(ov['hofSearch'].get(name, name))}").get("people", [])
            ppl = [p for p in ppl if p.get("mlbDebutDate")]
            if not ppl:
                flags.append(("HOF NO MATCH", yr["year"], name))
                seen[name] = None
                continue
            def dist(p):
                last = int((p.get("lastPlayedDate") or "1900")[:4])
                return abs(last - target)
            ppl.sort(key=dist)
            if dist(ppl[0]) > 3 or (len(ppl) > 1 and dist(ppl[1]) <= 3):
                flags.append(("HOF CHECK", yr["year"], name, [(p["id"], p["fullName"], p.get("lastPlayedDate")) for p in ppl[:3]], target))
            seen[name] = {"id": ppl[0]["id"], "name": ppl[0]["fullName"]}
    out["hof"] = seen
    (D / "player_ids.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
    for f in flags:
        print(*f)


if __name__ == "__main__":
    main()
