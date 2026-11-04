"""
Builds public/data/hitter-universe.json: an 11-coordinate address for every qualified hitter-season, plus a 3D map.

Reads swing_profile from Supabase, Hitting+ from hitting-plus.vercel.app, launch_readings.csv (from read_launch.py) and the
published 2026 launch numbers. Rerun by hand when a season is added. Needs numpy, pandas, requests and scikit-learn.

Usage (from the repo root, with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set):
  python3 scripts/universe/build_universe.py --published ~/swingplus/swing_profile/launch_2026.csv
"""
import argparse, json, os
from datetime import date
import numpy as np, pandas as pd, requests
from sklearn.manifold import TSNE

HERE = os.path.dirname(os.path.abspath(__file__))
HP_URL = 'https://hitting-plus.vercel.app/data/swingplus_latest.json'

# show_raw is off where the raw number has no plain baseball reading, so those show as percentiles only.
COORDS = [
    dict(key='sandbag', label='The Sandbag', unit='mph', digits=1, low='Small', high='Big', group='style', show_raw=True),
    dict(key='payoff_ev', label='Hard-swing payoff', unit='mph', digits=1, low='Small gain', high='Big gain', group='style', show_raw=True),
    dict(key='chase_penalty', label='Chase penalty', unit='mph', digits=1, low='Small', high='Big', group='style', show_raw=True),
    dict(key='two_strike_drop', label='Two-strike slowdown', unit='mph', digits=1, low='Swings harder', high='Eases off', group='style', show_raw=True),
    dict(key='picking_score', label='Picking his spots', unit='', digits=1, low='Spreads it around', high='Picks his spots', group='style', show_raw=False),
    dict(key='launch', label='Swing launch', unit='frames', digits=1, low='Later', high='Earlier', group='style', show_raw=True),
    dict(key='whiff_spread', label='Whiff direction', unit='', digits=1, low='Narrow split', high='Wide split', group='style', show_raw=False),
    dict(key='Decision+', label='Decision+', unit='', digits=0, low='Lower', high='Higher', group='grade', show_raw=True),
    dict(key='Timing+', label='Timing+', unit='', digits=0, low='Lower', high='Higher', group='grade', show_raw=True),
    dict(key='Contact+', label='Contact+', unit='', digits=0, low='Lower', high='Higher', group='grade', show_raw=True),
    dict(key='Power+', label='Power+', unit='', digits=0, low='Lower', high='Higher', group='grade', show_raw=True),
]


def fetch_swing_profile():
    url, key = os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    rows, offset = [], 0
    while True:
        r = requests.get(f'{url}/rest/v1/swing_profile?select=*&order=season,mlbam', timeout=60,
                         headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Range': f'{offset}-{offset + 999}'})
        r.raise_for_status()
        rows += r.json()
        offset += 1000
        if len(r.json()) < 1000:
            return pd.DataFrame(rows)


def fetch_hitting_plus():
    players = json.loads(requests.get(HP_URL, timeout=120).text.replace('NaN', 'null'))['players']
    cols = ['mlbamid', 'game_year', 'Decision+', 'Timing+', 'Contact+', 'Power+', 'Hitting+']
    return pd.DataFrame(players)[cols].rename(columns={'mlbamid': 'mlbam', 'game_year': 'season'})


def load_launch(readings_path, published_path):
    """One launch number per hitter-season, switch hitters averaged. Lines the local readings up with the published 2026 numbers."""
    d = pd.read_csv(readings_path, names=['key', 'status', 'frames'])
    d = d[d.status == 'ok'].drop_duplicates('key')
    d[['mlbam', 'season', 'side']] = d.key.str.split('-', expand=True)
    d[['mlbam', 'season']] = d[['mlbam', 'season']].astype(int)

    pub = pd.read_csv(published_path)[['mlbam', 'side', 'frames_to_contact']]
    both = d[d.season == 2026].merge(pub, on=['mlbam', 'side']).dropna()
    slope, intercept = np.polyfit(both.frames, both.frames_to_contact, 1)
    fit = slope * both.frames + intercept
    print(f'Launch line-up on {len(both)} 2026 videos: r={both.frames.corr(both.frames_to_contact):.3f}, '
          f'slope={slope:.3f}, intercept={intercept:.2f}, typical miss={np.abs(fit - both.frames_to_contact).median():.2f} frames')

    d['launch'] = slope * d.frames + intercept
    out = d.groupby(['mlbam', 'season'], as_index=False).launch.mean()
    published = pub.groupby('mlbam', as_index=False).frames_to_contact.mean()
    m = out.merge(published, on='mlbam', how='left')
    is_2026 = (m.season == 2026) & m.frames_to_contact.notna()
    m.loc[is_2026, 'launch'] = m.loc[is_2026, 'frames_to_contact']
    return m[['mlbam', 'season', 'launch']]


def whiff_spread(direction):
    """How far apart his breaking-ball and fastball whiffs sit, against where he meets the ball on all swings."""
    d = direction or {}
    if 'fastball' not in d or 'breaking' not in d:
        return None
    return d['breaking']['gap'] - d['fastball']['gap']


def steadiness(q, key):
    """Season-to-season correlation for the same hitter, averaged over the season pairs."""
    seasons = sorted(q.season.unique())
    rs = []
    for a, b in zip(seasons, seasons[1:]):
        j = pd.concat([q[q.season == a].set_index('mlbam')[key], q[q.season == b].set_index('mlbam')[key]], axis=1, join='inner').dropna()
        if len(j) > 10:
            rs.append(j.corr().iloc[0, 1])
    return round(float(np.mean(rs)), 2) if rs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--readings', default=os.path.join(HERE, 'launch_readings.csv'))
    ap.add_argument('--published', required=True)
    ap.add_argument('--out', default=os.path.join(HERE, '..', '..', 'public', 'data', 'hitter-universe.json'))
    args = ap.parse_args()

    sp = fetch_swing_profile()
    sp['whiff_spread'] = [whiff_spread(r) for r in sp.whiff_direction]
    q = sp[sp.qualified].merge(fetch_hitting_plus(), on=['mlbam', 'season'], how='inner')
    q = q.merge(load_launch(args.readings, args.published), on=['mlbam', 'season'], how='left').sort_values(['season', 'mlbam']).reset_index(drop=True)

    keys = [c['key'] for c in COORDS]
    # The same hitters read 0.7 frames lower on the 2026 videos, and no other coordinate shifts like that. The videos were
    # rendered separately, so closeness and percentiles compare launch after lining up each season's average. Rows keep the frames as read.
    by_season = q.groupby('season').launch.mean()
    launch_shift = (by_season - q.launch.mean()).round(3)
    print('Launch season shift:', launch_shift.to_dict())
    lined_up = q[keys].copy()
    lined_up['launch'] = q.launch - q.season.map(launch_shift)
    mean, sd = lined_up.mean(), lined_up.std()
    z = (lined_up - mean) / sd
    pct = (lined_up.rank(pct=True) * 100).round(0)
    xyz = TSNE(3, perplexity=30, init='pca', random_state=1).fit_transform(z.fillna(0).values)

    a = z.fillna(0).values
    d_all, d_map = ((a[:, None] - a[None]) ** 2).sum(2), ((xyz[:, None] - xyz[None]) ** 2).sum(2)
    np.fill_diagonal(d_all, np.inf), np.fill_diagonal(d_map, np.inf)
    top_all, top_map = np.argsort(d_all, 1)[:, :10], np.argsort(d_map, 1)[:, :10]
    kept = float(np.mean([len(set(x) & set(y)) / 10 for x, y in zip(top_all, top_map)]))
    print(f'Map keeps {kept:.0%} of each hitter\'s true top 10. {len(q)} hitter-seasons:', q.groupby('season').size().to_dict())
    print('Blank coordinates:', {k: int(v) for k, v in q[keys].isna().sum().items() if v})

    def clean(v, digits):
        return None if pd.isna(v) else round(float(v), digits)

    coords = [{**c, 'mean': round(float(mean[c['key']]), 4), 'sd': round(float(sd[c['key']]), 4), 'steady': steadiness(q, c['key'])} for c in COORDS]
    for c in coords:
        print(f"  {c['label']:<22} steadiness {c['steady']}")
    rows = []
    for i, r in q.iterrows():
        rows.append([int(r.mlbam), r['name'], int(r.season), clean(r['Hitting+'], 0), [round(float(x), 1) for x in xyz[i]],
                     [clean(r[k], 3) for k in keys], [clean(pct.loc[i, k], 0) for k in keys]])
    with open(args.out, 'w') as f:
        json.dump({'generated': date.today().isoformat(), 'map_kept': round(kept, 2), 'launch_shift': {str(k): float(v) for k, v in launch_shift.items()},
                   'coords': coords, 'rows': rows}, f, separators=(',', ':'))
    print('Wrote', os.path.relpath(args.out), f'{os.path.getsize(args.out) / 1e3:.0f} KB')


if __name__ == '__main__':
    main()
