import { storage } from './storage';

const KEY = 'peporra_current_group_id';

export const currentGroupStorage = {
  save: (groupId: string) => storage.setItem(KEY, groupId),
  get: () => storage.getItem(KEY),
  clear: () => storage.removeItem(KEY),
};
