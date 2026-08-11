import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, FAB, SegmentedButtons, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { groupsApi, GroupSummary } from '@/api/groups';
import { useCurrentGroup } from '@/context/CurrentGroupContext';
import { colors } from '@/config/theme';

function GroupCard({ group, onSelect }: { group: GroupSummary; onSelect: () => void }) {
  return (
    <Card style={styles.card} onPress={onSelect}>
      <Card.Title title={group.name} subtitle={`Temporada ${group.season}`} />
    </Card>
  );
}

export default function GroupsScreen() {
  const { selectGroup } = useCurrentGroup();
  const [tab, setTab] = useState<'activas' | 'historial'>('activas');

  const { data: groups, isLoading, isError, refetch } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  });

  // Temporada más reciente = "activa"; el resto = historial
  const { currentSeason, activeGroups, pastGroups } = useMemo(() => {
    if (!groups?.length) return { currentSeason: '', activeGroups: [], pastGroups: [] };
    const currentSeason = groups.reduce((max, g) => (g.season > max ? g.season : max), '');
    return {
      currentSeason,
      activeGroups: groups.filter((g) => g.season === currentSeason),
      pastGroups:   groups.filter((g) => g.season !== currentSeason),
    };
  }, [groups]);

  const hasPast = pastGroups.length > 0;
  const displayedGroups = tab === 'activas' ? activeGroups : pastGroups;

  async function handleSelect(g: GroupSummary) {
    await selectGroup({ id: g._id, season: g.season, name: g.name });
    router.replace('/(tabs)/predictions');
  }

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
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
      {/* Tabs solo si hay peñas de temporadas anteriores */}
      {hasPast && (
        <View style={styles.tabsWrapper}>
          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as 'activas' | 'historial')}
            buttons={[
              { value: 'activas',   label: 'Esta temporada' },
              { value: 'historial', label: 'Temporadas pasadas' },
            ]}
          />
        </View>
      )}

      <FlatList
        data={displayedGroups}
        keyExtractor={(g) => g._id}
        renderItem={({ item }) => (
          <GroupCard group={item} onSelect={() => handleSelect(item)} />
        )}
        contentContainerStyle={styles.list}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptySubtitle}>
              {tab === 'activas' ? 'No hay peñas activas.' : 'No hay peñas de temporadas anteriores.'}
            </Text>
          </View>
        }
      />

      {/* FABs solo en "Esta temporada" */}
      {tab === 'activas' && (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },

  tabsWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },

  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { width: '100%' },

  errorText: { color: '#FF4D6D' },
  retryButton: { marginTop: 8 },
  emptyTitle: { textAlign: 'center' },
  emptySubtitle: { textAlign: 'center', opacity: 0.6 },
  emptyActions: { flexDirection: 'row', gap: 12, marginTop: 8 },

  fabs: { position: 'absolute', bottom: 16, right: 16, gap: 8, alignItems: 'flex-end' },
  fabPrimary: {},
  fabSecondary: {},
});
