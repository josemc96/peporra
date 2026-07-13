import { apiFetch } from './client';

export type Award = 'pichichi' | 'zamora';

export interface AwardResult {
  _id: string;
  season: string;
  award: Award;
  realPlayer: string;
}

export const adminGlobalApi = {
  getAwardResults: (season: string) =>
    apiFetch<{ results: AwardResult[] }>(`/award-results?season=${encodeURIComponent(season)}`)
      .then((r) => r.results),

  setAwardResult: (season: string, award: Award, realPlayer: string) =>
    apiFetch<{ result: AwardResult }>('/admin/award-results', {
      method: 'PUT',
      body: JSON.stringify({ season, award, realPlayer }),
    }).then((r) => r.result),

  calculateScores: () =>
    apiFetch<{ message: string }>('/admin/calculate-scores', { method: 'POST' }),

  syncMatches: () =>
    apiFetch<{ message: string }>('/admin/sync-matches', { method: 'POST' }),

  syncScorers: () =>
    apiFetch<{ message: string }>('/admin/sync-scorers', { method: 'POST' }),
};
