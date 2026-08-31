export interface FanGraphsPitcher {
  playerId: string | null;
  name: string | null;
  throws: string | null;
  UPURL: string | null;
}

export interface FanGraphsRecord {
  teamId: number;
  league: string;
  division: string;
  abbName: string;
  gameDate: string;
  dh: number;
  isHome: boolean;
  team: {
    sp: FanGraphsPitcher | null;
    primaryPitcher: FanGraphsPitcher | null;
    opener: FanGraphsPitcher | null;
    notes: string | null;
  };
  opponent: {
    teamId: number;
    abbName: string;
    sp: FanGraphsPitcher | null;
    primaryPitcher: FanGraphsPitcher | null;
    opener: FanGraphsPitcher | null;
    notes: string | null;
  };
}

export interface FanGraphsResponse {
  games: FanGraphsRecord[];
}

export interface OpposingProbable {
  date: string;
  dayOfWeek: string;
  opponent: string;
  isAway: boolean;
  pitcher: string | null;
  hand: string | null;
  dh: number;
}

export interface TeamData {
  abbName: string;
  shortName: string;
  league: string;
  division: string;
  games: OpposingProbable[];
}

export interface GridData {
  teams: TeamData[];
  dates: string[];
  lastUpdated: string;
}
