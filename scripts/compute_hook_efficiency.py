"""
Compute 2026 manager hook efficiency from MLB Stats API play-by-play data.
Upserts results into the manager_hook_efficiency Supabase table.

Hook Efficiency = cumulative actual GSv2 / cumulative perfect GSv2
  - actual GSv2:  computed from SP's final line (ip, k, bb, h, er, hr)
  - perfect GSv2: max GSv2 achieved at any point during the start (requires PBP)
"""

import requests
import time
import sys
from collections import defaultdict
from supabase import create_client

# ── config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://moflaqmbamyjlpototzt.supabase.co"
SUPABASE_KEY = sys.argv[1] if len(sys.argv) > 1 else input("Supabase service key: ")
SEASON = 2026
SLEEP = 0.15  # seconds between MLB API calls

MLB_BASE = "https://statsapi.mlb.com/api/v1"

db = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── helpers ─────────────────────────────────────────────────────────────────────
def mlb(path, **params):
    r = requests.get(f"{MLB_BASE}{path}", params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def ip_to_outs(ip: float) -> int:
    innings = int(ip)
    return innings * 3 + round((ip - innings) * 10)

def gsv2(outs: int, k: int, bb: int, hits: int, runs: int, hr: int) -> float:
    return 40 + 2*outs + k - 2*bb - 2*hits - 3*runs - 6*hr

PA_OUTS = {
    'grounded_into_double_play': 2,
    'strikeout_double_play': 2,
    'double_play': 2,
    'triple_play': 3,
}

def pa_outs(event_type: str, is_out: bool) -> int:
    if event_type in PA_OUTS:
        return PA_OUTS[event_type]
    return 1 if is_out else 0

def pa_delta(event_type: str, is_out: bool, rbi: int):
    """Return (outs, k, bb, hits, runs, hr) for one PA."""
    outs = pa_outs(event_type, is_out)
    k    = 1 if event_type in ('strikeout', 'strikeout_double_play') else 0
    bb   = 1 if event_type in ('walk', 'intent_walk') else 0
    hr   = 1 if event_type == 'home_run' else 0
    hits = 1 if event_type in ('single', 'double', 'triple', 'home_run') else 0
    runs = rbi  # RBI as proxy for runs (same approximation the boxscore stats use)
    return outs, k, bb, hits, runs, hr

# ── step 1: build team → manager lookup ─────────────────────────────────────────
print("Fetching team manager roster…")
teams_data = mlb("/teams", sportId=1, season=SEASON)
team_manager: dict[int, str] = {}

for team in teams_data["teams"]:
    tid = team["id"]
    time.sleep(SLEEP)
    try:
        roster = mlb(f"/teams/{tid}/roster", rosterType="coach", season=SEASON)
        for entry in roster.get("roster", []):
            if entry.get("job", "").upper() in ("MG", "MANAGER"):
                team_manager[tid] = entry["person"]["fullName"]
                break
    except Exception as e:
        print(f"  Warning: couldn't fetch manager for team {tid}: {e}")

team_abbr: dict[int, str] = {t["id"]: t.get("abbreviation", "???") for t in teams_data["teams"]}
print(f"  {len(team_manager)} managers found")

# ── step 2: fetch 2026 regular season schedule ──────────────────────────────────
print("Fetching 2026 schedule…")
sched = mlb(
    "/schedule",
    sportId=1,
    season=SEASON,
    gameType="R",
    startDate=f"{SEASON}-03-01",
    endDate=f"{SEASON}-10-05",
    fields="dates,games,gamePk,status,abstractGameState,teams,home,away,team,id",
)

game_pks = []
for date in sched.get("dates", []):
    for g in date.get("games", []):
        if g.get("status", {}).get("abstractGameState") == "Final":
            game_pks.append(g["gamePk"])

print(f"  {len(game_pks)} final games to process")

# ── step 3: process each game ───────────────────────────────────────────────────
# manager_stats[manager_name] = {team, starts, actual_gsv2, perfect_gsv2}
manager_stats: dict[str, dict] = {}

def accum(manager: str, team: str, actual: float, perfect: float):
    if manager not in manager_stats:
        manager_stats[manager] = {"team": team, "starts": 0, "actual_gsv2": 0.0, "perfect_gsv2": 0.0}
    s = manager_stats[manager]
    s["team"] = team  # keep most recent (handles mid-season trades)
    s["starts"] += 1
    s["actual_gsv2"] += actual
    s["perfect_gsv2"] += perfect

errors = 0
for i, gk in enumerate(game_pks):
    if i % 50 == 0:
        print(f"  [{i}/{len(game_pks)}] processing…")
    time.sleep(SLEEP)

    try:
        pbp = mlb(f"/game/{gk}/playByPlay")
    except Exception as e:
        print(f"  Warning: PBP fetch failed for {gk}: {e}")
        errors += 1
        continue

    plays = pbp.get("allPlays", [])
    if not plays:
        continue

    # Determine SP for each side: first pitcher in each half-inning's first inning
    sp_by_side: dict[str, int | None] = {"top": None, "bottom": None}
    for play in plays:
        half = play["about"]["halfInning"]  # "top" or "bottom"
        inning = play["about"]["inning"]
        if inning == 1 and sp_by_side[half] is None:
            sp_by_side[half] = play["matchup"]["pitcher"]["id"]

    # For each SP, track running GSv2 per PA
    # key: (pitcher_id, half_inning) → running stats
    sp_running: dict[tuple, dict] = {}

    for play in plays:
        half = play["about"]["halfInning"]
        pitcher_id = play["matchup"]["pitcher"]["id"]

        # Only track the SP (first pitcher in inning 1)
        if pitcher_id != sp_by_side.get(half):
            # Once SP leaves, stop (don't track relievers)
            continue

        key = (pitcher_id, half)
        if key not in sp_running:
            sp_running[key] = {"outs": 0, "k": 0, "bb": 0, "hits": 0, "runs": 0, "hr": 0, "peak": 40.0}

        s = sp_running[key]
        result = play.get("result", {})
        event_type = result.get("eventType", "")
        is_out = result.get("isOut", False)
        rbi = result.get("rbi", 0)

        d_outs, d_k, d_bb, d_hits, d_runs, d_hr = pa_delta(event_type, is_out, rbi)
        s["outs"] += d_outs
        s["k"]    += d_k
        s["bb"]   += d_bb
        s["hits"] += d_hits
        s["runs"] += d_runs
        s["hr"]   += d_hr

        live_score = gsv2(s["outs"], s["k"], s["bb"], s["hits"], s["runs"], s["hr"])
        if live_score > s["peak"]:
            s["peak"] = live_score

    # For each SP we tracked, find their team and manager
    # "top" half = away team pitching; "bottom" = home team pitching
    # Get team info from boxscore
    if not sp_running:
        continue

    time.sleep(SLEEP)
    try:
        box = mlb(f"/game/{gk}/boxscore")
    except Exception as e:
        print(f"  Warning: boxscore fetch failed for {gk}: {e}")
        errors += 1
        continue

    side_team = {
        "top":    box["teams"]["away"]["team"]["id"],   # away pitches top
        "bottom": box["teams"]["home"]["team"]["id"],   # home pitches bottom
    }

    for (pitcher_id, half), s in sp_running.items():
        team_id = side_team[half]
        manager = team_manager.get(team_id)
        if not manager:
            continue

        actual = gsv2(s["outs"], s["k"], s["bb"], s["hits"], s["runs"], s["hr"])
        perfect = s["peak"]

        # perfect can't be less than actual (peak ≥ final by definition if we tracked correctly)
        perfect = max(actual, perfect)

        accum(manager, team_abbr.get(team_id, "???"), actual, perfect)

print(f"  Done — {len(manager_stats)} managers, {errors} errors")

# ── step 4: upsert into Supabase ────────────────────────────────────────────────
print("Upserting into Supabase…")
rows = []
for manager, s in manager_stats.items():
    actual = round(s["actual_gsv2"], 1)
    perfect = round(s["perfect_gsv2"], 1)
    rows.append({
        "season":        SEASON,
        "manager_name":  manager,
        "team":          s["team"],
        "starts":        s["starts"],
        "actual_gsv2":   actual,
        "perfect_gsv2":  perfect,
        "pts_left":      round(perfect - actual, 1),
    })

# Delete existing season data then insert fresh
db.table("manager_hook_efficiency").delete().eq("season", SEASON).execute()
result = db.table("manager_hook_efficiency").insert(rows).execute()
print(f"  Inserted {len(rows)} rows")
for r in rows:
    eff = r["actual_gsv2"] / r["perfect_gsv2"] if r["perfect_gsv2"] else 0
    print(f"  {r['manager_name']:<25} {r['team']}  {r['starts']:>3} starts  eff={eff:.3f}  pts_left={r['pts_left']:.0f}")

print("Done!")
