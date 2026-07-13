import { apiFetch } from './client';
import { Match } from './predictions';

export const adminMatchesApi = {
  create: (data: {
    season: string;
    competition: 'copa_del_rey' | 'supercopa';
    homeTeam: string;
    awayTeam: string;
    startTime: string;
  }) =>
    apiFetch<{ match: Match }>('/matches', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.match),

  setResult: (matchId: string, homeScore: number, awayScore: number) =>
    apiFetch<{ match: Match }>(`/matches/${matchId}/result`, {
      method: 'PUT',
      body: JSON.stringify({ homeScore, awayScore }),
    }).then((r) => r.match),

  setQualifier: (matchId: string, qualifier: 'home' | 'away') =>
    apiFetch<{ match: Match }>(`/matches/${matchId}/qualifier`, {
      method: 'PUT',
      body: JSON.stringify({ qualifier }),
    }).then((r) => r.match),
};
