import { apiFetch } from './client';

export interface StandingsRow {
  position: number;
  team: string;
}

export const standingsTableApi = {
  getCurrent: (season: string) =>
    apiFetch<{ table: StandingsRow[] }>(`/standings-table?season=${encodeURIComponent(season)}`)
      .then((r) => r.table),
};
