import { apiFetch } from './client';

export interface ManualAdjustment {
  _id: string;
  user: { _id: string; alias: string; email: string };
  points: number;
  reason?: string;
  createdAt: string;
}

export const manualAdjustmentsApi = {
  list: (groupId: string, season: string) =>
    apiFetch<{ adjustments: ManualAdjustment[] }>(`/groups/${groupId}/adjustments?season=${season}`),

  create: (groupId: string, body: { season: string; userId: string; points: number; reason?: string }) =>
    apiFetch<{ adjustment: ManualAdjustment }>(`/groups/${groupId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  delete: (groupId: string, id: string) =>
    apiFetch<{ message: string }>(`/groups/${groupId}/adjustments/${id}`, { method: 'DELETE' }),
};
