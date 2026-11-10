import { apiFetch } from './client';

export type MatchResult = 'W' | 'D' | 'L';

export interface MatchResultDetail {
  opponent: string;
  opponentCrest?: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: MatchResult;
  startTime: string;
}

export interface StandingsRow {
  position: number;
  team: string;
  crest?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  last5: MatchResult[];
  last5Detail: MatchResultDetail[];
}

export const standingsTableApi = {
  getCurrent: (season: string) =>
    apiFetch<{ table: StandingsRow[] }>(`/standings-table?season=${encodeURIComponent(season)}`)
      .then((r) => r.table),
};
