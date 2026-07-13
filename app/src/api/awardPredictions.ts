import { apiFetch } from './client';

export type Award = 'pichichi' | 'zamora';

export interface AwardPrediction {
  _id: string;
  season: string;
  award: Award;
  predictedPlayer: string;
  status: 'pending' | 'scored';
}

export interface Scorer {
  _id: string;
  season: string;
  playerName: string;
  team: string;
  goals: number;
  assists?: number;
  playedMatches?: number;
}

export const awardPredictionsApi = {
  get: (season: string, award: Award) =>
    apiFetch<{ prediction: AwardPrediction | null }>(
      `/award-predictions/${encodeURIComponent(season)}/${award}`
    ).then((r) => r.prediction),

  upsert: (season: string, award: Award, predictedPlayer: string) =>
    apiFetch<{ prediction: AwardPrediction }>('/award-predictions', {
      method: 'PUT',
      body: JSON.stringify({ season, award, predictedPlayer }),
    }).then((r) => r.prediction),

  listScorers: (season: string) =>
    apiFetch<{ scorers: Scorer[] }>(`/scorers?season=${encodeURIComponent(season)}`).then(
      (r) => r.scorers
    ),
};
