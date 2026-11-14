"""Find each voter's social links and a headshot. Writes data/socials.json, keyed by voter slug.

Run after build_profiles.py (it reads public/data/voters/profiles.json for names and outlets), then
rerun build_profiles.py to merge the result into the profiles.

Sources, all public and unauthenticated:
- Bluesky (public.api.bsky.app actor search). Accepted only when the display name matches the voter
  and the bio mentions baseball, a team, the BBWAA or one of the voter's outlets, and the account has
  100+ followers. Bots, parody and placeholder accounts are rejected.
- The Athletic author page (nytimes.com/athletic/author/<slug>/) for voters who list The Athletic.
  Its JSON-LD gives a headshot, job title and X link; accepted only if the job title or topics are baseball.
- MLB.com (mlb.com/news/topic/<slug>) for voters who list MLB.com: the first linked article carries
  the contributor's headshot.
Hand fixes live in socials_overrides.json and are applied by build_profiles.py, so they survive a refetch.

Headshot preference: publication headshot, then Bluesky avatar. Images are hotlinked, not stored.
Usage: python3 -I scripts/voters/fetch_socials.py [--only slug1,slug2]
"""
import html, json, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
PROFILES = HERE.parent.parent / "public" / "data" / "voters" / "profiles.json"
OUT = HERE / "data" / "socials.json"
OVERRIDES = HERE / "socials_overrides.json"
UA = {"User-Agent": "Mozilla/5.0 (baseball-hopper voter profiles)"}
BSKY = "https://public.api.bsky.app/xrpc/"

TEAMS = ["angels", "astros", "athletics", "blue jays", "braves", "brewers", "cardinals", "cubs", "diamondbacks",
         "d backs", "dodgers", "giants", "guardians", "indians", "mariners", "marlins", "mets", "nationals", "nats",
         "orioles", "padres", "phillies", "pirates", "rangers", "rays", "red sox", "reds", "rockies", "royals",
         "tigers", "twins", "white sox", "yankees", "expos"]
BASEBALL = ["baseball", "mlb", "bbwaa", "beat writer", "ballpark", "spring training", "world series"]
# Team names collide with other sports and fandom ("Wests Tigers", "Reds fan"), so they only count next to a
# journalism word; so do outlet names.
JOURNO = ["writer", "reporter", "columnist", "cover", "covers", "covering", "covered", "sportswriter", "beat",
          "journalist", "correspondent", "editor", "insider", "analyst", "reporting", "coverage", "sports"]


def bio_ok(bio, outlets):
    """Bluesky bio must mention baseball outright, or pair a journalism word with a team or outlet name."""
    bio = fold(bio)
    if any(re.search(w, bio) for w in REJECT):
        return False

    def has(words):
        return any(re.search(r"\b" + re.escape(w) + r"\b", bio) for w in words)
    return has(BASEBALL) or (has(JOURNO) and (has(TEAMS) or has(outlet_words(outlets))))
REJECT = [r"\bbots?\b", r"\bparody\b", r"\bfan account", r"\bnot affiliated", r"\bunofficial\b", r"\bfake\b",
          r"\bimpersonat", r"\bsatire\b", r"\btweets from\b", r"\bposting tweets\b"]
GENERIC_OUTLET_WORDS = {"the", "news", "times", "press", "post", "daily", "sports", "com", "network", "associated",
                        "star", "tribune", "journal", "herald", "sun", "at", "large", "honorary", "of", "and", "group",
                        "media", "radio", "magazine", "online", "new", "york", "chicago", "los", "angeles", "san"}


def fold(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s)


def tokens(s):
    return [t for t in fold(s).split() if t not in {"jr", "sr", "ii", "iii"}]


def name_matches(display, name):
    """First and last name must match; middle names/initials and emoji are ignored."""
    d, n = tokens(display), tokens(name)
    if len(d) < 2 or len(n) < 2:
        return False
    return d[0] == n[0] and d[-1] == n[-1]


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return r.url, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (402, 403, 404, 410):
                return None, None
            time.sleep(5 * (i + 1))
        except Exception:
            time.sleep(5 * (i + 1))
    return None, None


def slugify(name):
    return re.sub(r"\s+", "-", fold(name).strip())


def outlet_words(outlets):
    words = set()
    for o in outlets:
        for t in fold(o).split():
            if len(t) > 3 and t not in GENERIC_OUTLET_WORDS:
                words.add(t)
    return words


def bluesky(name, outlets):
    _, body = get(BSKY + "app.bsky.actor.searchActors?" + urllib.parse.urlencode({"q": name, "limit": 10}))
    if not body:
        return None
    cands = []
    for a in json.loads(body).get("actors", []):
        if not name_matches(a.get("displayName") or "", name):
            continue
        if re.search(r"bot\b|bot\.", a["handle"]) or not bio_ok(a.get("description") or "", outlets):
            continue
        cands.append(a)
    if not cands:
        return None
    _, body = get(BSKY + "app.bsky.actor.getProfiles?" + urllib.parse.urlencode([("actors", a["did"]) for a in cands]))
    profs = json.loads(body)["profiles"] if body else []
    profs = [p for p in profs if p.get("followersCount", 0) >= 100]
    if not profs:
        return None
    p = max(profs, key=lambda p: p.get("followersCount", 0))
    x = re.search(r"(?:twitter|x)\.com/@?(\w{1,15})", p.get("description") or "")
    return {"handle": p["handle"], "url": f"https://bsky.app/profile/{p['handle']}", "avatar": p.get("avatar"),
            "followers": p.get("followersCount"), "bio": (p.get("description") or "")[:200],
            "x": x.group(1) if x else None}


def persons(node):
    """Every schema.org Person anywhere in a JSON-LD blob (The Athletic nests it under mainEntity)."""
    if isinstance(node, dict):
        if node.get("@type") == "Person" and node.get("name"):
            yield node
        for v in node.values():
            yield from persons(v)
    elif isinstance(node, list):
        for v in node:
            yield from persons(v)


def athletic(name):
    url = f"https://www.nytimes.com/athletic/author/{slugify(name)}/"
    final, h = get(url)
    if not h:
        return None
    for blob in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            data = json.loads(blob)
        except ValueError:
            continue
        for person in persons(data):
            if not name_matches(person.get("name", ""), name):
                continue
            about = fold(json.dumps(person.get("knowsAbout", "")) + " " + (person.get("jobTitle") or "")
                         + " " + (person.get("description") or ""))
            if not any(w in about for w in ("mlb", "baseball", *TEAMS)):
                return None
            x = next((m.group(1) for s in person.get("sameAs", []) or []
                      if (m := re.search(r"(?:twitter|x)\.com/@?(\w{1,15})", s))), None)
            return {"url": final or url, "label": "The Athletic", "image": person.get("image"),
                    "title": person.get("jobTitle"), "x": x}
    return None


def mlbcom(name):
    slug = slugify(name)
    url = f"https://www.mlb.com/news/topic/{slug}"
    final, h = get(url)
    if not h or name not in html.unescape(h):
        return None
    arts = list(dict.fromkeys(re.findall(r'href="(?:https://www\.mlb\.com)?(/news/[a-z0-9-]{12,})"', h)))
    image = None
    for a in arts[:3]:
        _, ah = get("https://www.mlb.com" + a)
        if not ah:
            continue
        m = re.search(r'"Contributor","name":"([^"]+)","slug":"' + re.escape(slug) + r'".{0,500}?"templateUrl":"([^"]+)"', ah, re.S)
        if m and name_matches(m.group(1), name):
            image = m.group(2).replace("{formatInstructions}", "t_1x1/t_w372") + ".jpg"
            break
        time.sleep(0.5)
    return {"url": final or url, "label": "MLB.com", "image": image, "title": None, "x": None}


def main():
    profiles = json.loads(PROFILES.read_text())
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    out = json.loads(OUT.read_text()) if OUT.exists() and only else {}
    for i, (slug, p) in enumerate(sorted(profiles.items())):
        if only and slug not in only:
            continue
        outlets = sorted({a["outlet"] for a in p["awards"] if a.get("outlet")} | ({p["outlet"]} if p.get("outlet") else set()))
        rec = {}
        b = bluesky(p["name"], outlets)
        if b:
            rec["bluesky"] = b
        time.sleep(0.25)
        if any("athletic" in o.lower() for o in outlets):
            page = athletic(p["name"])
            if page:
                rec["page"] = page
            time.sleep(0.5)
        if "page" not in rec and any(o.lower().startswith("mlb") for o in outlets):
            page = mlbcom(p["name"])
            if page:
                rec["page"] = page
            time.sleep(0.5)
        if rec:
            out[slug] = rec
        else:
            out.pop(slug, None)
        if i % 50 == 0:
            print(i, slug, sorted(rec), file=sys.stderr)
    OUT.write_text(json.dumps(dict(sorted(out.items())), ensure_ascii=False, indent=1))
    print(f"{len(out)} voters with something; bluesky {sum('bluesky' in r for r in out.values())}, "
          f"pages {sum('page' in r for r in out.values())}", file=sys.stderr)


if __name__ == "__main__":
    main()
