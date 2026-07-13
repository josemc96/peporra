import { apiFetch } from './client';

export interface PenaltyEntry {
  position: number;
  amount: number;
}

export interface PenaltyConfig {
  _id: string;
  group: string;
  season: string;
  penalties: PenaltyEntry[];
}

export interface RankingEntry {
  user: { id: string; alias: string; email: string };
  points: number;
  exactScores: number;
}

export interface DebtEntry {
  user: { id: string; alias: string; email: string };
  total: number;
}

export const penaltiesApi = {
  getConfig: (groupId: string, season: string) =>
    apiFetch<{ config: PenaltyConfig | null }>(
      `/groups/${groupId}/penalties/config?season=${encodeURIComponent(season)}`
    ).then((r) => r.config),

  updateConfig: (groupId: string, season: string, penalties: PenaltyEntry[]) =>
    apiFetch<{ config: PenaltyConfig }>(`/groups/${groupId}/penalties/config`, {
      method: 'PUT',
      body: JSON.stringify({ season, penalties }),
    }).then((r) => r.config),

  recalculate: (groupId: string, season: string) =>
    apiFetch<{ message: string }>(`/groups/${groupId}/penalties/config/recalculate`, {
      method: 'POST',
      body: JSON.stringify({ season }),
    }),

  getMatchdayRanking: (groupId: string, season: string, matchday: number) =>
    apiFetch<{ ranking: RankingEntry[]; matchday: number }>(
      `/groups/${groupId}/penalties/matchday?season=${encodeURIComponent(season)}&matchday=${matchday}`
    ),

  getDebt: (groupId: string, season: string) =>
    apiFetch<{ debt: DebtEntry[] }>(
      `/groups/${groupId}/penalties/debt?season=${encodeURIComponent(season)}`
    ).then((r) => r.debt),
};
