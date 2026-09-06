import { apiFetch } from './client';

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
}

export const standingsTableApi = {
  getCurrent: (season: string) =>
    apiFetch<{ table: StandingsRow[] }>(`/standings-table?season=${encodeURIComponent(season)}`)
      .then((r) => r.table),
};
