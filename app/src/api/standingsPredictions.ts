import { apiFetch } from './client';

export interface StandingsRow {
  position: number;
  team: string;
}

export interface StandingsPrediction {
  _id: string;
  season: string;
  phase: 'ida' | 'vuelta';
  predictedTable: StandingsRow[];
  status: 'pending' | 'scored';
}

export const standingsPredictionsApi = {
  get: (season: string, phase: 'ida' | 'vuelta') =>
    apiFetch<{ prediction: StandingsPrediction | null }>(
      `/standings-predictions/${encodeURIComponent(season)}/${phase}`
    ).then((r) => r.prediction),

  upsert: (season: string, phase: 'ida' | 'vuelta', predictedTable: StandingsRow[]) =>
    apiFetch<{ prediction: StandingsPrediction }>('/standings-predictions', {
      method: 'PUT',
      body: JSON.stringify({ season, phase, predictedTable }),
    }).then((r) => r.prediction),

  listTeams: (season: string) =>
    apiFetch<{ matches: { homeTeam: string; awayTeam: string }[] }>(
      `/matches?season=${encodeURIComponent(season)}&competition=la_liga`
    ).then((r) => {
      const set = new Set<string>();
      r.matches.forEach((m) => { set.add(m.homeTeam); set.add(m.awayTeam); });
      return Array.from(set).sort();
    }),
};
