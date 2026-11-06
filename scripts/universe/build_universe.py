"""
Builds public/data/hitter-universe.json: a 14-coordinate swing address (how he swings, the swing's shape, his stance) for every
qualified hitter-season, plus a 3D map. The four Hitting+ components ride along for reference and do not count.

Reads swing_profile from Supabase, Hitting+ from hitting-plus.vercel.app, swing shape and stance from Baseball Savant, batting side from the MLB Stats API,
launch_readings.csv (from read_launch.py) and the published 2026 launch numbers. Rerun by hand when a season is added. Needs numpy, pandas, requests and scikit-learn.

Usage (from the repo root, with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set):
  python3 scripts/universe/build_universe.py --published ~/swingplus/swing_profile/launch_2026.csv
"""
import argparse, io, json, os
from datetime import date
import numpy as np, pandas as pd, requests
from sklearn.manifold import TSNE

HERE = os.path.dirname(os.path.abspath(__file__))
HP_URL = 'https://hitting-plus.vercel.app/data/swingplus_latest.json'
PEOPLE_URL = 'https://statsapi.mlb.com/api/v1/people'

# group: swing, shape and stance count toward closeness and the map. grade is shown for reference only and never counts,
# so hitters who swing alike but got different results still sit together.
# source: swing_profile (our engine), savant_path, savant_bat or savant_stance (Baseball Savant leaderboards), hitting_plus.
COORDS = [
    dict(key='normal_swing', label='Normal swing', unit='mph', digits=1, low='Slower', high='Faster', group='swing', source='swing_profile'),
    dict(key='sandbag', label='The Sandbag', unit='mph', digits=1, low='Small', high='Big', group='swing', source='swing_profile'),
    dict(key='chase_penalty', label='Chase penalty', unit='mph', digits=1, low='Small', high='Big', group='swing', source='swing_profile'),
    dict(key='two_strike_drop', label='Two-strike slowdown', unit='mph', digits=1, low='Swings harder', high='Eases off', group='swing', source='swing_profile'),
    dict(key='launch', label='Swing launch', unit='frames', digits=1, low='Later', high='Earlier', group='swing', source='swing_profile'),
    dict(key='swing_length', label='Swing length', unit='ft', digits=1, low='Compact', high='Long', group='shape', source='savant_bat'),
    dict(key='attack_angle', label='Attack angle', unit='°', digits=1, low='Level', high='Uphill', group='shape', source='savant_path'),
    dict(key='swing_tilt', label='Swing tilt', unit='°', digits=1, low='Flat', high='Steep', group='shape', source='savant_path'),
    dict(key='attack_direction', label='Bat direction at contact', unit='°', digits=1, low='Pull side', high='Other way', group='shape', source='savant_path'),
    dict(key='contact_point', label='Contact point', unit='in', digits=1, low='Lets it travel', high='Out in front', group='shape', source='savant_path'),
    dict(key='foot_sep', label='Stance width', unit='in', digits=1, low='Narrow', high='Wide', group='stance', source='savant_stance'),
    dict(key='stance_angle', label='Open or closed', unit='°', digits=1, low='Open', high='Closed', group='stance', source='savant_stance'),
    dict(key='off_plate', label='Distance off the plate', unit='in', digits=1, low='Crowds the plate', high='Off the plate', group='stance', source='savant_stance'),
    dict(key='box_depth', label='Depth in the box', unit='in', digits=1, low='Up in the box', high='Back in the box', group='stance', source='savant_stance'),
    dict(key='Decision+', label='Decision+', unit='', digits=0, low='Lower', high='Higher', group='grade', source='hitting_plus'),
    dict(key='Timing+', label='Timing+', unit='', digits=0, low='Lower', high='Higher', group='grade', source='hitting_plus'),
    dict(key='Contact+', label='Contact+', unit='', digits=0, low='Lower', high='Higher', group='grade', source='hitting_plus'),
    dict(key='Power+', label='Power+', unit='', digits=0, low='Lower', high='Higher', group='grade', source='hitting_plus'),
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


SAVANT = 'https://baseballsavant.mlb.com'
SAVANT_FILES = {
    # minSwings=1 so every qualified hitter-season in the universe is covered, not just Savant's own qualifiers.
    'savant_path': ('/leaderboard/bat-tracking/swing-path-attack-angle?gameType=Regular&minSwings=1&type=batter&csv=true',
                    {'attack_angle': 'attack_angle', 'swing_tilt': 'swing_tilt', 'attack_direction': 'attack_direction', 'avg_intercept_y_vs_batter': 'contact_point'}),
    'savant_bat': ('/leaderboard/bat-tracking?gameType=Regular&minSwings=1&minGroupSwings=1&type=batter&csv=true', {'swing_length': 'swing_length'}),
    'savant_stance': ('/visuals/batting-stance?minSwings=1&minGroupSwings=1&csv=true',
                      {'avg_foot_sep': 'foot_sep', 'avg_stance_angle': 'stance_angle', 'avg_batter_x_position': 'off_plate', 'avg_batter_y_position': 'box_depth'}),
}


def fetch_savant(seasons):
    """Swing shape and stance from Baseball Savant, one row per hitter-season. Switch hitters' two stances are averaged."""
    out = None
    for path, cols in SAVANT_FILES.values():
        parts = []
        for y in seasons:
            r = requests.get(f'{SAVANT}{path}&seasonStart={y}&seasonEnd={y}', timeout=120)
            r.raise_for_status()
            d = pd.read_csv(io.StringIO(r.content.decode('utf-8-sig')))
            d = d.rename(columns={'id': 'mlbam', **cols}).groupby('mlbam', as_index=False)[list(cols.values())].mean()
            parts.append(d.assign(season=y))
        d = pd.concat(parts)
        out = d if out is None else out.merge(d, on=['mlbam', 'season'], how='outer')
    return out


def fetch_bats(ids):
    """Which side each hitter bats from: L, R or S."""
    ids, bats = sorted(ids), {}
    for start in range(0, len(ids), 100):
        r = requests.get(PEOPLE_URL, params={'personIds': ','.join(map(str, ids[start:start + 100]))}, timeout=60)
        r.raise_for_status()
        bats.update({p['id']: p['batSide']['code'] for p in r.json()['people'] if 'batSide' in p})
    return bats


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
    q = sp[sp.qualified].merge(fetch_hitting_plus(), on=['mlbam', 'season'], how='inner')
    q = q.merge(load_launch(args.readings, args.published), on=['mlbam', 'season'], how='left')
    q = q.merge(fetch_savant(sorted(q.season.unique())), on=['mlbam', 'season'], how='left').sort_values(['season', 'mlbam']).reset_index(drop=True)

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
    bats = fetch_bats(q.mlbam.unique().tolist())
    print('Bats', pd.Series(q.mlbam.map(bats)).value_counts(dropna=False).to_dict())
    counted = [i for i, c in enumerate(COORDS) if c['group'] != 'grade']
    a = z.iloc[:, counted].fillna(0).values
    xyz = TSNE(3, perplexity=30, init='pca', random_state=1).fit_transform(a)

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
                     [clean(r[k], 3) for k in keys], [clean(pct.loc[i, k], 0) for k in keys], bats.get(int(r.mlbam))])
    with open(args.out, 'w') as f:
        json.dump({'generated': date.today().isoformat(), 'map_kept': round(kept, 2), 'launch_shift': {str(k): float(v) for k, v in launch_shift.items()},
                   'coords': coords, 'rows': rows}, f, separators=(',', ':'))
    print('Wrote', os.path.relpath(args.out), f'{os.path.getsize(args.out) / 1e3:.0f} KB')


if __name__ == '__main__':
    main()
