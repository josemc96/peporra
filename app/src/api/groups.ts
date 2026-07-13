import { apiFetch } from './client';

export interface GroupMember {
  _id: string;
  alias: string;
  email: string;
}

// Lista: admin y members sin populate (solo IDs)
export interface GroupSummary {
  _id: string;
  name: string;
  season: string;
  inviteCode: string;
  admin: string;
  members: string[];
  createdAt: string;
}

// Detalle: admin y members populados
export interface GroupDetail {
  _id: string;
  name: string;
  season: string;
  inviteCode: string;
  admin: GroupMember;
  members: GroupMember[];
  createdAt: string;
}

export const groupsApi = {
  list: () => apiFetch<{ groups: GroupSummary[] }>('/groups').then((r) => r.groups),
  get: (id: string) => apiFetch<{ group: GroupDetail }>(`/groups/${id}`).then((r) => r.group),
  create: (name: string, season: string) =>
    apiFetch<{ group: GroupSummary }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, season }),
    }).then((r) => r.group),
  join: (inviteCode: string) =>
    apiFetch<{ group: GroupSummary }>('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    }).then((r) => r.group),
  leave: (groupId: string) =>
    apiFetch<{ message: string }>(`/groups/${groupId}/members/me`, { method: 'DELETE' }),
  kick: (groupId: string, userId: string) =>
    apiFetch<{ message: string }>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
};
