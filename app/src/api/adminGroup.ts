import { apiFetch } from './client';

export interface RuleEntry {
  rule: { _id: string; key: string; name: string; description: string; scope: string };
  points: number;
  active: boolean;
}

export type GroupFeature = 'standings' | 'pichichi' | 'zamora';

export interface GroupRuleSettings {
  _id: string;
  group: string;
  season: string;
  rules: RuleEntry[];
  enabledCompetitions: ('copa_del_rey' | 'supercopa')[];
  enabledFeatures: GroupFeature[];
}

export interface ScoreMultiplier {
  _id: string;
  group: string;
  season: string;
  scope: 'match' | 'matchday';
  match?: string;
  matchday?: number;
  multiplier: number;
}

export const adminGroupApi = {
  getRuleSettings: (groupId: string, season: string) =>
    apiFetch<{ settings: GroupRuleSettings }>(
      `/groups/${groupId}/rule-settings?season=${encodeURIComponent(season)}`
    ).then((r) => r.settings),

  updateRuleSettings: (
    groupId: string,
    season: string,
    rules?: { key: string; points?: number; active?: boolean }[],
    enabledCompetitions?: ('copa_del_rey' | 'supercopa')[],
    enabledFeatures?: GroupFeature[]
  ) =>
    apiFetch<{ settings: GroupRuleSettings }>(`/groups/${groupId}/rule-settings`, {
      method: 'PUT',
      body: JSON.stringify({ season, rules, enabledCompetitions, enabledFeatures }),
    }).then((r) => r.settings),

  listMultipliers: (groupId: string, season: string) =>
    apiFetch<{ multipliers: ScoreMultiplier[] }>(
      `/groups/${groupId}/multipliers?season=${encodeURIComponent(season)}`
    ).then((r) => r.multipliers),

  createMultiplier: (
    groupId: string,
    data: { season: string; scope: 'match' | 'matchday'; match?: string; matchday?: number; multiplier: number }
  ) =>
    apiFetch<{ multiplier: ScoreMultiplier }>(`/groups/${groupId}/multipliers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.multiplier),

  deleteMultiplier: (groupId: string, multiplierId: string) =>
    apiFetch<void>(`/groups/${groupId}/multipliers/${multiplierId}`, { method: 'DELETE' }),
};
