import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Surface, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { rankingApi, RankingEntry } from '@/api/ranking';
import { useAuth } from '@/context/AuthContext';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function RankingRow({
  entry,
  position,
  isMe,
}: {
  entry: RankingEntry;
  position: number;
  isMe: boolean;
}) {
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;

  return (
    <Surface
      style={[styles.row, isMe && styles.rowMe]}
      elevation={isMe ? 2 : 1}
    >
      <View style={[styles.positionBox, medalColor ? { backgroundColor: medalColor } : styles.positionBoxDefault]}>
        <Text variant="titleMedium" style={styles.positionText}>
          {position}
        </Text>
      </View>

      <Avatar.Text
        size={36}
        label={entry.user.alias.slice(0, 2).toUpperCase()}
        style={styles.avatar}
      />

      <View style={styles.userInfo}>
        <Text variant="bodyLarge" style={[styles.alias, isMe && styles.aliasMe]}>
          {entry.user.alias}
          {isMe ? '  (tú)' : ''}
        </Text>
      </View>

      <Text variant="titleMedium" style={[styles.points, medalColor ? { color: medalColor } : undefined]}>
        {entry.points} pts
      </Text>
    </Surface>
  );
}

export default function RankingScreen() {
  const { groupId, season } = useLocalSearchParams<{ groupId: string; season: string }>();
  const { user } = useAuth();

  const { data: ranking, isLoading, isError } = useQuery({
    queryKey: ['ranking', groupId, season],
    queryFn: () => rankingApi.get(groupId, season),
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !ranking) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No se pudo cargar el ranking</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="labelMedium" style={styles.seasonLabel}>Temporada {season}</Text>

      <FlatList
        data={ranking}
        keyExtractor={(entry) => entry.user.id}
        renderItem={({ item, index }) => (
          <RankingRow
            entry={item}
            position={index + 1}
            isMe={item.user.id === user?.id}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonLabel: {
    textAlign: 'center',
    opacity: 0.5,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    padding: 12,
    gap: 8,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  rowMe: {
    borderWidth: 1.5,
    borderColor: '#1565C0',
  },
  positionBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  positionBoxDefault: {
    backgroundColor: '#E0E0E0',
  },
  positionText: {
    fontWeight: '700',
    color: '#fff',
  },
  avatar: {
    backgroundColor: '#90A4AE',
  },
  userInfo: {
    flex: 1,
  },
  alias: {
    fontWeight: '500',
  },
  aliasMe: {
    color: '#1565C0',
    fontWeight: '700',
  },
  points: {
    fontWeight: '700',
  },
  errorText: {
    color: '#9C3B2C',
  },
});
