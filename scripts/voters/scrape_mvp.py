"""Scrape BBWAA MVP ballot pages (bbwaa.com/YY-{al,nl}-mvp-ballots/) into data/mvp_bbwaa.json."""
import html, json, re, sys, time, urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT = Path(__file__).parent / "data" / "mvp_bbwaa.json"
UA = "Mozilla/5.0 (baseball-hopper voter profiles)"


class Table(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.depth = [], None, None, 0

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.depth += 1
        elif tag == "tr" and self.depth:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append(" ")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(re.sub(r"\s+", " ", html.unescape("".join(self.cell))).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if any(self.row):
                self.rows.append(self.row)
            self.row = None
        elif tag == "table":
            self.depth -= 1

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def parse(page):
    t = Table()
    t.feed(page)
    rows = t.rows
    hi = next(i for i, r in enumerate(rows) if any(re.match(r"^1st$", c, re.I) for c in r))
    hdr = [c.lower() for c in rows[hi]]
    first = next(i for i, c in enumerate(hdr) if c == "1st")
    ballots = []
    for r in rows[hi + 1:]:
        if len(r) < first + 1 or not r[0]:
            continue
        info = dict(zip(hdr[:first], r[:first]))
        picks = [p for p in r[first:first + 10]]
        ballots.append({"voter": r[0], "outlet": info.get("affiliation") or info.get("outlet") or None,
                        "chapter": info.get("chapter") or None, "picks": picks})
    return ballots


def main():
    years = range(2012, 2026)
    out = []
    for y in years:
        for lg in ("al", "nl"):
            url = f"https://bbwaa.com/{y % 100:02d}-{lg}-mvp-ballots/"
            try:
                b = parse(fetch(url))
            except Exception as e:
                print("FAIL", url, e, file=sys.stderr)
                continue
            out.append({"year": y, "league": lg.upper(), "url": url, "ballots": b})
            print(y, lg, len(b), b[0]["voter"], b[0]["outlet"], b[0]["chapter"], b[0]["picks"][:3])
            time.sleep(0.5)
    OUT.write_text(json.dumps({"source": "bbwaa.com", "awards": out}, ensure_ascii=False, indent=0))


if __name__ == "__main__":
    main()
