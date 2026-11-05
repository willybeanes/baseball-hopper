// Cot's team codes -> display names, ordered by name for the team picker.
export const TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Diamondbacks', ATH: 'Athletics', ATL: 'Atlanta Braves', BAL: 'Baltimore Orioles',
  BOS: 'Boston Red Sox', CHC: 'Chicago Cubs', CWS: 'Chicago White Sox', CIN: 'Cincinnati Reds',
  CLE: 'Cleveland Guardians', COL: 'Colorado Rockies', DET: 'Detroit Tigers', HOU: 'Houston Astros',
  KC: 'Kansas City Royals', LAA: 'Los Angeles Angels', LAD: 'Los Angeles Dodgers', MIA: 'Miami Marlins',
  MIL: 'Milwaukee Brewers', MIN: 'Minnesota Twins', NYM: 'New York Mets', NYY: 'New York Yankees',
  PHI: 'Philadelphia Phillies', PIT: 'Pittsburgh Pirates', SD: 'San Diego Padres', SEA: 'Seattle Mariners',
  SF: 'San Francisco Giants', STL: 'St. Louis Cardinals', TB: 'Tampa Bay Rays', TEX: 'Texas Rangers',
  TOR: 'Toronto Blue Jays', WSH: 'Washington Nationals',
}

// Divisions, for the projected standings.
export const DIVISIONS: { name: string; teams: string[] }[] = [
  { name: 'AL East', teams: ['BAL', 'BOS', 'NYY', 'TB', 'TOR'] },
  { name: 'AL Central', teams: ['CLE', 'CWS', 'DET', 'KC', 'MIN'] },
  { name: 'AL West', teams: ['ATH', 'HOU', 'LAA', 'SEA', 'TEX'] },
  { name: 'NL East', teams: ['ATL', 'MIA', 'NYM', 'PHI', 'WSH'] },
  { name: 'NL Central', teams: ['CHC', 'CIN', 'MIL', 'PIT', 'STL'] },
  { name: 'NL West', teams: ['ARI', 'COL', 'LAD', 'SD', 'SF'] },
]
