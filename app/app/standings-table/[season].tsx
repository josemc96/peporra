import { useLocalSearchParams } from 'expo-router';

import { TeamStandingsTable } from '@/components/TeamStandingsTable';

export default function StandingsTableScreen() {
  const { season } = useLocalSearchParams<{ season: string }>();
  return <TeamStandingsTable season={season} />;
}
