import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { currentGroupStorage, StoredGroup } from '@/config/currentGroup';

interface CurrentGroupState {
  group: StoredGroup | null;
  initializing: boolean;
  selectGroup: (g: StoredGroup) => Promise<void>;
  leaveGroup: () => Promise<void>;
}

const CurrentGroupContext = createContext<CurrentGroupState>({
  group: null,
  initializing: true,
  selectGroup: async () => {},
  leaveGroup: async () => {},
});

export function CurrentGroupProvider({ children }: { children: ReactNode }) {
  const [group, setGroup] = useState<StoredGroup | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    currentGroupStorage.get().then((g) => {
      setGroup(g ?? null);
      setInitializing(false);
    });
  }, []);

  async function selectGroup(g: StoredGroup) {
    await currentGroupStorage.save(g);
    setGroup(g);
  }

  async function leaveGroup() {
    await currentGroupStorage.clear();
    setGroup(null);
  }

  return (
    <CurrentGroupContext.Provider value={{ group, initializing, selectGroup, leaveGroup }}>
      {children}
    </CurrentGroupContext.Provider>
  );
}

export const useCurrentGroup = () => useContext(CurrentGroupContext);
