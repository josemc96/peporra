import { router, useLocalSearchParams } from 'expo-router';

import { GroupDetail } from '@/components/GroupDetail';
import { currentGroupStorage } from '@/config/currentGroup';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  async function handleLeave() {
    await currentGroupStorage.clear();
    router.replace('/(tabs)');
  }

  return <GroupDetail groupId={id} onLeave={handleLeave} />;
}
