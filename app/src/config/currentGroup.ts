import { storage } from './storage';

const KEY = 'peporra_current_group_v2';

export interface StoredGroup { id: string; season: string; name: string; }

export const currentGroupStorage = {
  save: (g: StoredGroup) => storage.setItem(KEY, JSON.stringify(g)),
  get: async (): Promise<StoredGroup | null> => {
    const val = await storage.getItem(KEY);
    if (!val) return null;
    try { return JSON.parse(val) as StoredGroup; } catch { return null; }
  },
  clear: () => storage.removeItem(KEY),
};
