# Voter Profiles data

Builds `public/data/voters/*.json` for `/voters` and `/voter/[slug]`.

```bash
python3 -I scripts/voters/parse_tracker.py "<path to BBHOF Tracker.xlsm>"   # HOF ballots, every year tab
python3 -I scripts/voters/scrape_mvp.py                                      # bbwaa.com MVP ballots 2012+
python3 -I scripts/voters/match_players.py                                   # names -> MLBAM ids (prints anything uncertain)
python3 -I scripts/voters/build_profiles.py                                  # profiles, standings, similar voters
```

- `overrides.json`: hand fixes for MVP ballot names and HOF candidate searches.
- `aliases.json`: voter name spellings that are the same person (raw name -> canonical).
- `data/br_mvp_votes.json`: cached Baseball-Reference vote-getter lists, used to pick the right "Martinez".
- The tracker workbook itself is not committed; `data/hof_tracker.json` is the parsed copy.
- Voter pages are fully static (`dynamicParams = false`), so no ISR writes.
