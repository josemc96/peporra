import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, FAB, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { groupsApi, GroupSummary } from '@/api/groups';
import { useCurrentGroup } from '@/context/CurrentGroupContext';

function GroupCard({ group, onSelect }: { group: GroupSummary; onSelect: () => void }) {
  return (
    <Card style={styles.card} onPress={onSelect}>
      <Card.Title title={group.name} subtitle={`Temporada ${group.season}`} />
    </Card>
  );
}

export default function GroupsScreen() {
  const { selectGroup } = useCurrentGroup();

  const { data: groups, isLoading, isError, refetch } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  });

  async function handleSelect(g: GroupSummary) {
    await selectGroup({ id: g._id, season: g.season, name: g.name });
    router.replace('/(tabs)/predictions');
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error al cargar las peñas</Text>
        <Button onPress={() => refetch()} style={styles.retryButton}>Reintentar</Button>
      </View>
    );
  }

  if (!groups?.length) {
    return (
      <View style={styles.centered}>
        <Text variant="titleMedium" style={styles.emptyTitle}>Sin peñas todavía</Text>
        <Text style={styles.emptySubtitle}>Crea una peña o únete con un código de invitación</Text>
        <View style={styles.emptyActions}>
          <Button mode="contained" onPress={() => router.push('/groups/create')}>Nueva peña</Button>
          <Button mode="outlined" onPress={() => router.push('/groups/join')}>Unirse</Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g._id}
        renderItem={({ item }) => (
          <GroupCard group={item} onSelect={() => handleSelect(item)} />
        )}
        contentContainerStyle={styles.list}
        onRefresh={refetch}
        refreshing={isLoading}
      />

      <View style={styles.fabs}>
        <FAB
          icon="account-plus"
          label="Unirse"
          size="small"
          style={styles.fabSecondary}
          onPress={() => router.push('/groups/join')}
        />
        <FAB
          icon="plus"
          label="Nueva peña"
          style={styles.fabPrimary}
          onPress={() => router.push('/groups/create')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { width: '100%' },
  errorText: { color: '#9C3B2C' },
  retryButton: { marginTop: 8 },
  emptyTitle: { textAlign: 'center' },
  emptySubtitle: { textAlign: 'center', opacity: 0.6 },
  emptyActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  fabs: { position: 'absolute', bottom: 16, right: 16, gap: 8, alignItems: 'flex-end' },
  fabPrimary: {},
  fabSecondary: {},
});
