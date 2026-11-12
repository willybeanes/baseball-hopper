# Voter Profiles data

Builds `public/data/voters/*.json` for `/voters` and `/voter/[slug]`.

```bash
python3 -I scripts/voters/parse_tracker.py "<path to BBHOF Tracker.xlsm>"   # HOF ballots, every year tab
python3 -I scripts/voters/scrape_mvp.py                                      # bbwaa.com MVP ballots 2012+
python3 -I scripts/voters/scrape_awards.py [--missing]                       # Cy Young, ROY, Manager, Reliever (2012+, Cy 2009 NL)
python3 -I scripts/voters/fetch_fwar.py                                      # FanGraphs WAR by league-season via fg-proxy
python3 -I scripts/voters/match_players.py                                   # names -> MLBAM ids (prints anything uncertain)
python3 -I scripts/voters/build_profiles.py                                  # profiles, standings, similar voters
```

- `overrides.json`: hand fixes for MVP ballot names and HOF candidate searches.
- `aliases.json`: voter name spellings that are the same person (raw name -> canonical).
- bbwaa.com rate-limits bursts with 403s; `scrape_awards.py --missing` refetches only award-years the file lacks.
  Two pages are off-pattern and listed in `SPECIAL` (2023 AL ROY, 2025 NL Manager).
- `data/br_mvp_votes.json`: cached Baseball-Reference vote-getter lists, used to pick the right "Martinez".
- The tracker workbook itself is not committed; `data/hof_tracker.json` is the parsed copy.
- Voter pages are fully static (`dynamicParams = false`), so no ISR writes.

WAR alignment: for each award-year the WAR ballot is the top N in fWAR among eligible players (MVP: batting +
pitching; Cy Young: pitching; ROY: FanGraphs `ind=2` rookies; Reliever: FanGraphs relievers; none for Manager).
A ballot's WAR match is its fWAR weighted by award points (MVP 14-9-8…, 5-place 7-4-3-2-1, 3-place 5-3-1)
divided by the WAR ballot's. Voters are ranked by their average gap to the median voter (3+ ballots).
