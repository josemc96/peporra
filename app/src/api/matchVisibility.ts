import { apiFetch } from './client';

interface VisibilityUser { id: string; alias: string; }
interface VisibilityUserWithPoints extends VisibilityUser { points: number | null; }

export type MatchVisibility =
  | {
      phase: 'upcoming';
      members: {
        user: VisibilityUser;
        hasPredicted: boolean;
        revealedPrediction?: { predictedHome: number; predictedAway: number };
      }[];
    }
  | {
      phase: 'live';
      groups: { predictedHome: number; predictedAway: number; users: VisibilityUser[] }[];
      noPrediction: VisibilityUser[];
    }
  | {
      phase: 'finished';
      realHome: number;
      realAway: number;
      groups: { predictedHome: number; predictedAway: number; users: VisibilityUserWithPoints[]; points: number }[];
      noPrediction: VisibilityUser[];
    };

export const matchVisibilityApi = {
  get: (groupId: string, matchId: string) =>
    apiFetch<MatchVisibility>(`/groups/${groupId}/matches/${matchId}/predictions`),
};
