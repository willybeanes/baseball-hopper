"""
Compute 2026 manager hook efficiency from MLB Stats API play-by-play data.

Populates two Supabase tables:
  manager_hook_efficiency  — season aggregates per manager (with mlbam_id for headshots)
  manager_hook_starts      — per-start detail rows (season, manager_name, game_date,
                             pitcher_name, actual_gsv2, perfect_gsv2, pts_left)

Usage:
  python3 scripts/compute_hook_efficiency.py <supabase_service_key>
"""

import requests
import time
import sys
from supabase import create_client

# ── config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://moflaqmbamyjlpototzt.supabase.co"
SUPABASE_KEY = sys.argv[1] if len(sys.argv) > 1 else input("Supabase service key: ")
SEASON = 2026
SLEEP = 0.15

MLB_BASE = "https://statsapi.mlb.com/api/v1"

db = create_client(SUPABASE_URL, SUPABASE_KEY)

def mlb(path, **params):
    r = requests.get(f"{MLB_BASE}{path}", params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def gsv2(outs, k, bb, hits, runs, hr):
    return 40 + 2*outs + k - 2*bb - 2*hits - 3*runs - 6*hr

PA_OUTS = {
    'grounded_into_double_play': 2,
    'strikeout_double_play': 2,
    'double_play': 2,
    'triple_play': 3,
}

def pa_delta(event_type, is_out, rbi):
    outs = PA_OUTS.get(event_type, 1 if is_out else 0)
    k    = 1 if event_type in ('strikeout', 'strikeout_double_play') else 0
    bb   = 1 if event_type in ('walk', 'intent_walk') else 0
    hr   = 1 if event_type == 'home_run' else 0
    hits = 1 if event_type in ('single', 'double', 'triple', 'home_run') else 0
    return outs, k, bb, hits, rbi, hr  # rbi as runs proxy

# ── step 1: build team metadata and per-date manager cache ─────────────────────
print("Fetching team list…")
teams_data = mlb("/teams", sportId=1, season=SEASON)
team_abbr: dict[int, str] = {t["id"]: t.get("abbreviation", "???") for t in teams_data["teams"]}

# Cache: (team_id, date_str) → (manager_name, mlbam_id)
_mgr_cache: dict[tuple[int, str], tuple[str, int] | None] = {}

def get_manager(team_id: int, date: str) -> tuple[str, int] | None:
    """Look up manager for a team on a specific date. Cached to avoid repeated API calls."""
    key = (team_id, date)
    if key in _mgr_cache:
        return _mgr_cache[key]
    time.sleep(SLEEP)
    try:
        roster = mlb(f"/teams/{team_id}/roster", rosterType="coach", season=SEASON, date=date)
        for entry in roster.get("roster", []):
            if entry.get("jobId", "").upper() in ("MNGR", "NTRM") or "manager" in entry.get("job", "").lower():
                person = entry["person"]
                result = (person["fullName"], person["id"])
                _mgr_cache[key] = result
                return result
    except Exception as e:
        print(f"  Warning: manager lookup failed team={team_id} date={date}: {e}")
    _mgr_cache[key] = None
    return None

print(f"  {len(team_abbr)} teams loaded (managers fetched per-game date)")

# ── step 2: fetch schedule ──────────────────────────────────────────────────────
print("Fetching 2026 schedule…")
sched = mlb(
    "/schedule",
    sportId=1, season=SEASON, gameType="R",
    startDate=f"{SEASON}-03-01", endDate=f"{SEASON}-10-05",
)

game_entries = []  # list of (game_pk, official_date)
for date in sched.get("dates", []):
    for g in date.get("games", []):
        if g.get("status", {}).get("abstractGameState") == "Final":
            game_date = g.get("officialDate") or date.get("date", "")
            game_entries.append((g["gamePk"], game_date))

print(f"  {len(game_entries)} final games to process")

# ── step 3: process each game ───────────────────────────────────────────────────
# manager_agg[manager_name] = {mlbam_id, team, starts, actual, perfect}
manager_agg: dict[str, dict] = {}
start_rows: list[dict] = []  # per-start detail

errors = 0
for i, (gk, game_date) in enumerate(game_entries):
    if i % 50 == 0:
        print(f"  [{i}/{len(game_entries)}] processing…")
    time.sleep(SLEEP)

    try:
        pbp = mlb(f"/game/{gk}/playByPlay")
    except Exception as e:
        print(f"  Warning: PBP {gk}: {e}")
        errors += 1
        continue

    plays = pbp.get("allPlays", [])
    if not plays:
        continue

    # Identify SP for each half-inning (first pitcher in inning 1)
    sp_by_side: dict[str, int | None] = {"top": None, "bottom": None}
    sp_name_by_side: dict[str, str] = {"top": "", "bottom": ""}
    for play in plays:
        half = play["about"]["halfInning"]
        if play["about"]["inning"] == 1 and sp_by_side[half] is None:
            m = play["matchup"]["pitcher"]
            sp_by_side[half] = m["id"]
            sp_name_by_side[half] = m.get("fullName", "")

    sp_running: dict[tuple, dict] = {}
    for play in plays:
        half = play["about"]["halfInning"]
        pitcher_id = play["matchup"]["pitcher"]["id"]
        if pitcher_id != sp_by_side.get(half):
            continue
        key = (pitcher_id, half)
        if key not in sp_running:
            sp_running[key] = {"outs": 0, "k": 0, "bb": 0, "hits": 0, "runs": 0, "hr": 0, "peak": 40.0}
        s = sp_running[key]
        result = play.get("result", {})
        d = pa_delta(result.get("eventType", ""), result.get("isOut", False), result.get("rbi", 0))
        s["outs"] += d[0]; s["k"] += d[1]; s["bb"] += d[2]
        s["hits"] += d[3]; s["runs"] += d[4]; s["hr"] += d[5]
        live = gsv2(s["outs"], s["k"], s["bb"], s["hits"], s["runs"], s["hr"])
        if live > s["peak"]:
            s["peak"] = live

    if not sp_running:
        continue

    time.sleep(SLEEP)
    try:
        box = mlb(f"/game/{gk}/boxscore")
    except Exception as e:
        print(f"  Warning: boxscore {gk}: {e}")
        errors += 1
        continue

    side_team = {
        "top":    box["teams"]["home"]["team"]["id"],   # home SP pitches top half
        "bottom": box["teams"]["away"]["team"]["id"],   # away SP pitches bottom half
    }

    for (pitcher_id, half), s in sp_running.items():
        team_id = side_team[half]
        mgr_info = get_manager(team_id, game_date)
        if not mgr_info:
            continue
        manager_name, mgr_mlbam = mgr_info

        actual  = gsv2(s["outs"], s["k"], s["bb"], s["hits"], s["runs"], s["hr"])
        perfect = max(actual, s["peak"])

        # aggregate
        if manager_name not in manager_agg:
            manager_agg[manager_name] = {"mlbam_id": mgr_mlbam, "team": team_abbr.get(team_id, "???"),
                                          "starts": 0, "actual": 0.0, "perfect": 0.0}
        a = manager_agg[manager_name]
        a["team"] = team_abbr.get(team_id, "???")
        a["starts"] += 1
        a["actual"]  += actual
        a["perfect"] += perfect

        # per-start row
        start_rows.append({
            "season":       SEASON,
            "manager_name": manager_name,
            "team":         team_abbr.get(team_id, "???"),
            "game_date":    game_date,
            "game_pk":      gk,
            "pitcher_name": sp_name_by_side[half],
            "pitcher_id":   pitcher_id,
            "actual_gsv2":  round(actual, 1),
            "perfect_gsv2": round(perfect, 1),
            "pts_left":     round(perfect - actual, 1),
        })

print(f"  Done — {len(manager_agg)} managers, {len(start_rows)} starts, {errors} errors")

# ── step 4: upsert aggregate table ─────────────────────────────────────────────
print("Upserting manager_hook_efficiency…")
agg_rows = []
for manager, s in manager_agg.items():
    actual  = round(s["actual"], 1)
    perfect = round(s["perfect"], 1)
    agg_rows.append({
        "season":        SEASON,
        "manager_name":  manager,
        "mlbam_id":      s["mlbam_id"],
        "team":          s["team"],
        "starts":        s["starts"],
        "actual_gsv2":   actual,
        "perfect_gsv2":  perfect,
        "pts_left":      round(perfect - actual, 1),
    })

db.table("manager_hook_efficiency").delete().eq("season", SEASON).execute()
db.table("manager_hook_efficiency").insert(agg_rows).execute()
print(f"  {len(agg_rows)} rows inserted")

# ── step 5: upsert per-start table ─────────────────────────────────────────────
print("Upserting manager_hook_starts…")
db.table("manager_hook_starts").delete().eq("season", SEASON).execute()

CHUNK = 500
for i in range(0, len(start_rows), CHUNK):
    db.table("manager_hook_starts").insert(start_rows[i:i+CHUNK]).execute()
print(f"  {len(start_rows)} rows inserted")

# ── summary ─────────────────────────────────────────────────────────────────────
for r in sorted(agg_rows, key=lambda x: x["actual_gsv2"] / x["perfect_gsv2"], reverse=True):
    eff = r["actual_gsv2"] / r["perfect_gsv2"]
    print(f"  {r['manager_name']:<25} {r['team']}  {r['starts']:>3}gs  eff={eff:.3f}  pts_left={r['pts_left']:.0f}")

print("Done!")
