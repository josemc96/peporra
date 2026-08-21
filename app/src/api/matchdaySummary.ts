import { apiFetch } from './client';
import { CardKey } from './cards';

export interface CardImpact {
  card: CardKey;
  byAlias?: string;
}

export interface MatchdaySummaryMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest?: string;
  awayCrest?: string;
  startTime: string;
  homeScore: number;
  awayScore: number;
  predictedHome: number;
  predictedAway: number;
  points: number;
  preCardPoints: number;
  isExact: boolean;
  cardImpact: CardImpact | null;
}

export interface MatchdaySummaryGroup {
  key: string;
  label: string;
  totalPoints: number;
  matches: MatchdaySummaryMatch[];
}

export const matchdaySummaryApi = {
  get: (groupId: string, userId: string, season: string) =>
    apiFetch<{ groups: MatchdaySummaryGroup[] }>(
      `/groups/${groupId}/matchday-summary/${userId}?season=${encodeURIComponent(season)}`
    ),
};
