# Voter Profiles data

Builds `public/data/voters/*.json` for `/voters` and `/voter/[slug]`.

```bash
python3 -I scripts/voters/parse_tracker.py "<path to BBHOF Tracker.xlsm>"   # HOF ballots, every year tab
python3 -I scripts/voters/scrape_mvp.py [--years 2013,2014]                    # bbwaa.com MVP ballots 2012+
python3 -I scripts/voters/scrape_awards.py [--missing | --only cy:2014:nl]     # Cy Young, ROY, Manager, Reliever (2012+, Cy 2009 NL)
python3 -I scripts/voters/fetch_fwar.py                                      # FanGraphs WAR by league-season via fg-proxy
python3 -I scripts/voters/match_players.py                                   # names -> MLBAM ids (prints anything uncertain)
python3 -I scripts/voters/build_profiles.py                                  # profiles, standings, similar voters
python3 -I scripts/voters/fetch_socials.py [--only slug,slug]                  # Bluesky / The Athletic / MLB.com links + headshots
python3 -I scripts/voters/build_profiles.py                                  # again, to merge data/socials.json
```

- `overrides.json`: hand fixes for MVP ballot names and HOF candidate searches.
- `aliases.json`: voter name spellings that are the same person (raw name -> canonical).
- `socials_overrides.json`: hand fixes for `fetch_socials.py` (re-add a checked account, drop a wrong match).
  Bluesky matches need the exact first/last name, 100+ followers, and a bio that says baseball/MLB/BBWAA outright
  or pairs a journalism word with a team or outlet name. Team names alone are too loose ("Wests Tigers", "Reds fan").
  Headshots are hotlinked (publication photo first, then Bluesky avatar); the page falls back to initials on error.
  X handles come only from The Athletic author pages and Bluesky bios; X itself isn't searched.
- bbwaa.com rate-limits bursts with 403s; `scrape_awards.py --missing` refetches only award-years the file lacks,
  `--only award:year[:lg],...` refetches specific pages, and `scrape_mvp.py --years` does the same for MVP.
- The chapter column is headed "Chapter" on some pages and "Chapt." on others (2013-15); both scrapers take any header
  starting with "chap". 2009 NL Cy Young has no chapter column, so those 32 ballots have chapter null.
- Raw scrape files keep chapters as printed. build_profiles.py cleans them: uppercase, "*" removed, and
  `chapterSub: true` on the ballot when a star was present (an out-of-town writer filling a short-handed chapter).
  The Athletics' AL slot is OAK through 2024, SF in 2025 and SF/ATH in 2026; SF/ATH is kept as printed.
  Two pages are off-pattern and listed in `SPECIAL` (2023 AL ROY, 2025 NL Manager).
- `data/br_mvp_votes.json`: cached Baseball-Reference vote-getter lists, used to pick the right "Martinez".
- The tracker workbook itself is not committed; `data/hof_tracker.json` is the parsed copy.
- Voter pages are fully static (`dynamicParams = false`), so no ISR writes.

WAR alignment: for each award-year the WAR ballot is the top N in fWAR among eligible players (MVP: batting +
pitching; Cy Young: pitching; ROY: FanGraphs `ind=2` rookies; Reliever: FanGraphs relievers; none for Manager).
A ballot's WAR match is its fWAR weighted by award points (MVP 14-9-8…, 5-place 7-4-3-2-1, 3-place 5-3-1)
divided by the WAR ballot's. Voters are ranked by their average gap to the median voter (3+ ballots).

`build_profiles.py` also writes `public/data/voters/trends.json` (~45 KB): one row per award-year (winner, WAR leader,
winner's WAR rank, median/mean/consensus WAR match, share of first-place votes to the WAR leader), one row per HOF year
(public ballots, average and median names, full-ballot share, blanks, electees) and one row per chapter. It is sized
for Claude Chat or any tool to read by URL; definitions are inside the file under `about`.
