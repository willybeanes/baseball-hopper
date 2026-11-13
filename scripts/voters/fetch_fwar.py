"""FanGraphs WAR by league-season (via fg-proxy) for the WAR-ballot comparison.

Pools: bat + pit (MVP), pit (Cy Young), rookies bat + pit (ROY, FanGraphs ind=2), rel (Reliever).
Writes data/fwar.json: {"YYYY|LG": {"bat": {mlbam: [name, war]}, "pit": ..., "rbat": ..., "rpit": ..., "rel": ...}}.
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).parent / "data" / "fwar.json"
PROXY = "https://fg-proxy.vercel.app/api/fangraphs"
POOLS = {"bat": ("bat", None), "pit": ("pit", None), "rbat": ("bat", "2"), "rpit": ("pit", "2"), "rel": ("rel", None)}


def board(year, lg, stats, ind):
    q = {"pos": "all", "stats": stats, "lg": lg.lower(), "qual": "0", "type": "8", "season": year, "season1": year,
         "month": "0", "pageitems": "5000", "pagenum": "1"}
    if ind:
        q["ind"] = ind
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{PROXY}?{urllib.parse.urlencode(q)}", timeout=60) as r:
                d = json.load(r)
            rows = d["data"] if isinstance(d, dict) else d
            return {str(x["xMLBAMID"]): [x.get("PlayerName"), round(x.get("WAR") or 0, 2)]
                    for x in rows if x.get("xMLBAMID")}
        except Exception as e:
            print("retry", year, lg, stats, ind, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"fg-proxy failed {year} {lg} {stats}")


def main():
    out = json.loads(OUT.read_text()) if OUT.exists() else {}
    for y in range(2009, 2027):
        for lg in ("AL", "NL"):
            key = f"{y}|{lg}"
            cur = out.setdefault(key, {})
            for pool, (stats, ind) in POOLS.items():
                if pool in cur or (pool == "rel" and y < 2026):
                    continue
                cur[pool] = board(y, lg, stats, ind)
                time.sleep(0.3)
            print(key, {k: len(v) for k, v in cur.items()}, file=sys.stderr)
            OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
