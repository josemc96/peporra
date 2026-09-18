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

export interface GroupStandingsPrediction {
  _id: string;
  user: { _id: string; alias: string; email: string };
  season: string;
  phase: 'ida' | 'vuelta';
  predictedTable: StandingsRow[];
  status: 'pending' | 'scored';
  // Puntos "si la clasificación se quedara así ahora mismo", contra la tabla en vivo.
  livePoints: number;
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

  getGroupPredictions: (groupId: string, season: string, phase?: 'ida' | 'vuelta') =>
    apiFetch<{ predictions: GroupStandingsPrediction[] }>(
      `/groups/${groupId}/standings-predictions?season=${encodeURIComponent(season)}${phase ? `&phase=${phase}` : ''}`
    ).then((r) => r.predictions),

  listTeams: (season: string) =>
    apiFetch<{ matches: { homeTeam: string; awayTeam: string }[] }>(
      `/matches?season=${encodeURIComponent(season)}&competition=la_liga`
    ).then((r) => {
      const set = new Set<string>();
      r.matches.forEach((m) => { set.add(m.homeTeam); set.add(m.awayTeam); });
      return Array.from(set).sort();
    }),
};
