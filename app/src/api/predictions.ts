import { apiFetch } from './client';

export interface Match {
  _id: string;
  season: string;
  competition: 'la_liga' | 'copa_del_rey' | 'supercopa';
  matchday?: number;
  isKnockout: boolean;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  homeScore?: number;
  awayScore?: number;
  status: 'pending' | 'finished';
  realQualifier?: 'home' | 'away';
}

export interface Prediction {
  _id: string;
  user: string;
  match: Match;
  predictedHome: number;
  predictedAway: number;
  status: 'pending' | 'scored';
}

export const predictionsApi = {
  listMatches: (season: string) =>
    apiFetch<{ matches: Match[] }>(`/matches?season=${encodeURIComponent(season)}`).then((r) => r.matches),

  listMyPredictions: (season: string) =>
    apiFetch<{ predictions: Prediction[] }>(`/predictions?season=${encodeURIComponent(season)}`).then(
      (r) => r.predictions
    ),

  upsert: (matchId: string, predictedHome: number, predictedAway: number) =>
    apiFetch<{ prediction: Prediction }>('/predictions', {
      method: 'PUT',
      body: JSON.stringify({ matchId, predictedHome, predictedAway }),
    }).then((r) => r.prediction),
};
