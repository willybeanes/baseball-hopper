"""Parse Ryan Thibodaux's BBHOF Tracker workbook into public HOF ballots.

Usage: python3 -I scripts/voters/parse_tracker.py "<path to BBHOF Tracker.xlsm>"
Writes scripts/voters/data/hof_tracker.json. Macros are never run (openpyxl reads values only).
"""
import json, re, sys, datetime, unicodedata
from pathlib import Path
import openpyxl

OUT = Path(__file__).parent / "data" / "hof_tracker.json"
MARKS = {"x", "1", "1.0"}
RESULT_LABELS = ("actual final %", "actual results:", "total results")


def clean(s):
    s = str(s).replace(" ", " ")
    s = re.sub(r"-\s*\n\s*", "", s)          # hyphen-wrapped names: "Encar-\nnación"
    s = re.sub(r"(\w)-\s+(\w)", r"\1\2", s)   # "Ander- son"
    return re.sub(r"\s+", " ", s.replace("\n", " ")).strip()


def is_mark(v):
    return v is not None and str(v).strip().lower() in MARKS


def header_row(rows):
    def run(r):
        n = 0
        for v in r[1:]:
            if isinstance(v, str) and re.search(r"[A-Za-z]", v) and "%" not in v:
                n += 1
            else:
                break
        return n
    return max(range(min(8, len(rows))), key=lambda i: run(rows[i]))


def parse_sheet(ws):
    year = int(ws.title[:4])
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    h = header_row(rows)
    cands = []
    for j, v in enumerate(rows[h][1:], start=1):
        if not (isinstance(v, str) and re.search(r"[A-Za-z]", v)) or re.search(r"(?i)\blink\b|total|ballot|votes|%", v):
            break
        name = clean(v)
        m = re.search(r"\((\d+)(?:st|nd|rd|th)\)", name)
        cands.append({"col": j, "name": re.sub(r"\s*\(.*?\)\s*$", "", name).strip(),
                      "ballotYear": int(m.group(1)) if m else None})
    cols = [c["col"] for c in cands]
    last = cols[-1]

    results = {}
    for r in rows[: h + 30]:
        lab = str(r[0] or "").strip().lower()
        if any(lab.startswith(l) for l in RESULT_LABELS) and not results:
            for c in cands:
                v = r[c["col"]]
                if isinstance(v, (int, float)) or (isinstance(v, str) and re.match(r"^0?\.\d+$|^1(\.0+)?$|^0$", v.strip())):
                    results[c["name"]] = float(v)

    ballots = []
    for i, r in enumerate(rows):
        if i <= h or not isinstance(r[0], str) or not r[0].strip():
            continue
        cells = [r[c] if c < len(r) else None for c in cols]
        filled = [str(v).strip() for v in cells if v is not None and str(v).strip() != ""]
        raw = clean(r[0])
        if " " not in raw and not raw.lower().startswith("anon"):
            continue  # stat labels such as "Rank"
        count = next((v for v in r[last + 1 : last + 4] if v is not None and str(v).strip() != ""), None)
        blank_text = {f.lower() for f in filled} <= {"blank", "ballot"} and filled
        blank = blank_text or (not filled and str(count).strip() in ("0", "0.0") and i > h + 5) or "blank ballot" in raw.lower()
        filled = [f for f in filled if f not in ("?", "+")]
        if not blank and (not filled or not all(is_mark(v) for v in filled)):
            continue
        note = None
        raw = re.sub(r"(?i)\s*\([^)]*blank[^)]*\)?|\s*-?\s*blank ballot.*$", "", raw).strip() or raw
        m = re.search(r"\((.*?)\)\s*$", raw)
        if m:
            note = m.group(1).strip()
            raw = raw[: m.start()].strip()
        tail = [v for v in r[last + 1 : last + 8]]
        source, released, url = None, None, None
        for v in tail:
            if isinstance(v, datetime.datetime) and not released:
                released = v.date().isoformat()
            elif isinstance(v, str) and v.startswith("http") and not url:
                url = v.strip()
            elif isinstance(v, str) and not re.match(r"^\d+(\.\d+)?$", v.strip()) and not source and len(v.strip()) > 1:
                source = clean(v)
        ballots.append({
            "voter": raw,
            "note": note,
            "anonymous": raw.lower().startswith("anon") or "unknown voter" in raw.lower(),
            "blank": bool(blank),
            "votes": [] if blank else [c["name"] for c, v in zip(cands, cells) if is_mark(v)],
            "source": source,
            "released": released,
            "url": url,
        })
    return {"year": year, "candidates": [{k: c[k] for k in ("name", "ballotYear")} for c in cands],
            "results": results, "ballots": ballots}


def main(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    years = [parse_sheet(ws) for ws in wb.worksheets if re.match(r"^20\d\d", ws.title)]
    years.sort(key=lambda y: y["year"])
    OUT.write_text(json.dumps({"source": "Ryan Thibodaux BBHOF Tracker (2026 workbook)", "years": years},
                              ensure_ascii=False, indent=0))
    for y in years:
        named = [b for b in y["ballots"] if not b["anonymous"]]
        print(y["year"], "cands", len(y["candidates"]), "ballots", len(y["ballots"]), "named", len(named),
              "results", len(y["results"]), "| e.g.", named[0]["voter"], named[0]["votes"][:3], named[0]["source"], named[0]["released"])


if __name__ == "__main__":
    main(sys.argv[1])
