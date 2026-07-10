import { apiFetch } from './client';

export interface RankingEntry {
  user: {
    id: string;
    alias: string;
    email: string;
  };
  points: number;
  exactScores: number;
}

export const rankingApi = {
  get: (groupId: string, season: string) =>
    apiFetch<{ ranking: RankingEntry[] }>(
      `/groups/${groupId}/ranking?season=${encodeURIComponent(season)}`
    ).then((r) => r.ranking),
};
