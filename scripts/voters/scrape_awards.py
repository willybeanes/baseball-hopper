"""Scrape BBWAA Cy Young, Rookie of the Year, Manager of the Year and Reliever ballots.

Pages are bbwaa.com/YY-{al,nl}-{cy,roy,mgr,reliever}/: a results table (full names, team, points)
and a ballot table (voter, affiliation, chapter, picks). Writes data/awards_bbwaa.json.
"""
import json, re, sys, time, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_mvp import Table, fetch  # noqa: E402

OUT = Path(__file__).parent / "data" / "awards_bbwaa.json"
# Pages that don't follow the YY-lg-award slug.
SPECIAL = {
    ("roy", 2023, "al"): "https://bbwaa.com/orioles-gunnar-henderson-unanimously-wins-al-jackie-robinson-rookie-of-the-year/",
    ("mgr", 2025, "nl"): "https://bbwaa.com/25-nl-nmgr/",
}
FIRST = {"1st", "first", "first place", "1st place"}
AWARDS = {"cy": "Cy Young", "roy": "Rookie of the Year", "mgr": "Manager of the Year", "reliever": "Reliever of the Year"}


def tables(page):
    out = []
    for chunk in re.findall(r"<table.*?</table>", page, re.S):
        t = Table()
        t.feed(chunk)
        out.append(t.rows)
    return out


def parse(page):
    results, ballots = [], []
    for rows in tables(page):
        if not rows:
            continue
        hdr = [c.lower().strip() for c in rows[0]]
        first = next((i for i, c in enumerate(hdr) if c in FIRST), None)
        if first is None:
            continue
        if "affiliation" in hdr or "chapter" in hdr:
            for r in rows[1:]:
                if len(r) <= first or not r[0]:
                    continue
                info = dict(zip(hdr[:first], r[:first]))
                ballots.append({"voter": r[0], "outlet": info.get("affiliation") or None,
                                "chapter": info.get("chapter") or None, "picks": r[first:]})
        elif "points" in hdr:
            pi = hdr.index("points")
            for r in rows[1:]:
                if len(r) <= pi or not r[0]:
                    continue
                name, _, team = r[0].partition(",")
                firsts = r[first].strip()
                results.append({"name": name.strip(), "team": team.strip() or None,
                                "firsts": int(firsts) if firsts.isdigit() else 0,
                                "points": int(r[pi]) if r[pi].strip().isdigit() else 0})
    return results, ballots


def fetch_retry(url):
    for wait in (0, 20, 60):
        time.sleep(wait)
        try:
            return fetch(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
    return fetch(url)


def main():
    """Default: scrape everything. --missing: keep the existing file, fetch only award-years it lacks."""
    missing_only = "--missing" in sys.argv
    out = json.loads(OUT.read_text())["awards"] if missing_only and OUT.exists() else []
    have = {(a["award"], a["year"], a["league"].lower()) for a in out}
    for code in AWARDS:
        for y in range(2009, 2027):
            for lg in ("al", "nl"):
                if (code, y, lg) in have:
                    continue
                url = SPECIAL.get((code, y, lg), f"https://bbwaa.com/{y % 100:02d}-{lg}-{code}/")
                try:
                    results, ballots = parse(fetch_retry(url))
                except Exception as e:  # 404s for years before an award's ballots were published
                    continue
                finally:
                    time.sleep(1)
                if not ballots:
                    continue
                n = max(len(b["picks"]) for b in ballots)
                for b in ballots:
                    b["picks"] = (b["picks"] + [""] * n)[:n]
                out.append({"award": code, "year": y, "league": lg.upper(), "url": url,
                            "results": results, "ballots": ballots})
                print(code, y, lg, len(ballots), "ballots", len(results), "results", n, "places", file=sys.stderr)
    out.sort(key=lambda a: (list(AWARDS).index(a["award"]), a["year"], a["league"]))
    OUT.write_text(json.dumps({"source": "bbwaa.com", "awards": out}, ensure_ascii=False, indent=0))


if __name__ == "__main__":
    main()
