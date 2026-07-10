import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, FAB, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { groupsApi, GroupSummary } from '@/api/groups';
import { currentGroupStorage } from '@/config/currentGroup';
import { GroupDetail } from '@/components/GroupDetail';

function GroupCard({ group, onSelect }: { group: GroupSummary; onSelect: (id: string) => void }) {
  return (
    <Card style={styles.card} onPress={() => onSelect(group._id)}>
      <Card.Title title={group.name} subtitle={`Temporada ${group.season}`} />
    </Card>
  );
}

export default function GroupsScreen() {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Al montar: restaurar la última peña
  useEffect(() => {
    currentGroupStorage.get().then((id) => {
      setActiveGroupId(id ?? null);
      setInitializing(false);
    });
  }, []);

  // Al volver al tab (tras crear/unirse): recoger si se guardó una peña nueva
  useFocusEffect(
    useCallback(() => {
      if (initializing) return;
      currentGroupStorage.get().then((id) => {
        if (id && id !== activeGroupId) setActiveGroupId(id);
      });
    }, [initializing, activeGroupId])
  );

  const { data: groups, isLoading, isError, refetch } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
    enabled: !initializing && activeGroupId === null,
  });

  async function selectGroup(id: string) {
    await currentGroupStorage.save(id);
    setActiveGroupId(id);
  }

  async function leaveGroup() {
    await currentGroupStorage.clear();
    setActiveGroupId(null);
    refetch();
  }

  if (initializing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Mostrar detalle de la peña activa inline (tab bar sigue visible)
  if (activeGroupId) {
    return <GroupDetail groupId={activeGroupId} onLeave={leaveGroup} />;
  }

  // Lista de peñas
  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error al cargar las peñas</Text>
          <Button onPress={() => refetch()} style={styles.retryButton}>Reintentar</Button>
        </View>
      )}

      {!isLoading && !isError && groups?.length === 0 && (
        <View style={styles.centered}>
          <Text variant="titleMedium" style={styles.emptyTitle}>Sin peñas todavía</Text>
          <Text style={styles.emptySubtitle}>Crea una peña o únete con un código de invitación</Text>
        </View>
      )}

      {!isLoading && !isError && groups && groups.length > 0 && (
        <FlatList
          data={groups}
          keyExtractor={(g) => g._id}
          renderItem={({ item }) => <GroupCard group={item} onSelect={selectGroup} />}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      )}

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
  fabs: { position: 'absolute', bottom: 16, right: 16, gap: 8, alignItems: 'flex-end' },
  fabPrimary: {},
  fabSecondary: {},
});
