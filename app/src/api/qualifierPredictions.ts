import { apiFetch } from './client';
import { Match } from './predictions';

export type Qualifier = 'home' | 'away';

export interface QualifierPrediction {
  _id: string;
  match: string | Match;
  predictedQualifier: Qualifier;
  status: 'pending' | 'scored';
}

export const qualifierPredictionsApi = {
  listMine: () =>
    apiFetch<{ predictions: QualifierPrediction[] }>('/qualifier-predictions').then(
      (r) => r.predictions
    ),

  upsert: (matchId: string, predictedQualifier: Qualifier) =>
    apiFetch<{ prediction: QualifierPrediction }>('/qualifier-predictions', {
      method: 'PUT',
      body: JSON.stringify({ matchId, predictedQualifier }),
    }).then((r) => r.prediction),

  listKnockoutMatches: (season: string) =>
    Promise.all([
      apiFetch<{ matches: Match[] }>(`/matches?season=${encodeURIComponent(season)}&competition=copa_del_rey`).then((r) => r.matches),
      apiFetch<{ matches: Match[] }>(`/matches?season=${encodeURIComponent(season)}&competition=supercopa`).then((r) => r.matches),
    ]).then(([copa, supra]) =>
      [...copa, ...supra]
        .filter((m) => m.isKnockout)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    ),
};
