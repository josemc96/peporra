import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Icon,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';

import { standingsPredictionsApi } from '@/api/standingsPredictions';

type Phase = 'ida' | 'vuelta';

export default function StandingsPredictionScreen() {
  const { season } = useLocalSearchParams<{ season: string }>();
  const theme = useTheme();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>('ida');
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['la-liga-teams', season],
    queryFn: () => standingsPredictionsApi.listTeams(season),
    staleTime: Infinity,
  });

  const { data: prediction, isLoading: predLoading } = useQuery({
    queryKey: ['standings-prediction', season, phase],
    queryFn: () => standingsPredictionsApi.get(season, phase),
    enabled: !!teams,
  });

  useEffect(() => {
    if (!teams) return;
    if (prediction) {
      const sorted = [...prediction.predictedTable].sort((a, b) => a.position - b.position);
      setTeamOrder(sorted.map((r) => r.team));
    } else {
      setTeamOrder([...teams]);
    }
    setSaved(false);
  }, [prediction, teams, phase]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () =>
      standingsPredictionsApi.upsert(
        season,
        phase,
        teamOrder.map((team, i) => ({ position: i + 1, team }))
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['standings-prediction', season, phase] });
      setSaved(true);
    },
  });

  const isLoading = teamsLoading || predLoading;
  const isLocked = prediction?.status === 'scored';

  function renderItem({ item, drag, isActive, getIndex }: RenderItemParams<string>) {
    const idx = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <Surface
          style={[styles.row, isActive && { backgroundColor: theme.colors.primaryContainer }]}
          elevation={isActive ? 4 : 1}
        >
          <Text
            variant="titleMedium"
            style={[styles.pos, { color: theme.colors.onSurfaceVariant }]}
          >
            {idx + 1}
          </Text>
          <Text variant="bodyLarge" style={styles.teamName}>
            {item}
          </Text>
          {!isLocked && (
            <Pressable onPressIn={drag} style={styles.handle} hitSlop={8}>
              <Icon source="drag" size={24} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          )}
        </Surface>
      </ScaleDecorator>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No hay partidos sincronizados para esta temporada.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.phaseRow}>
        <Chip selected={phase === 'ida'} onPress={() => setPhase('ida')} style={styles.chip}>
          Ida (J19)
        </Chip>
        <Chip selected={phase === 'vuelta'} onPress={() => setPhase('vuelta')} style={styles.chip}>
          Vuelta (J38)
        </Chip>
      </View>

      {!isLocked && (
        <Text variant="labelSmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          Arrastra el icono ≡ para reordenar
        </Text>
      )}
      {isLocked && (
        <Text variant="labelSmall" style={styles.lockedNote}>
          Predicción puntuada — solo lectura
        </Text>
      )}

      <DraggableFlatList
        data={teamOrder}
        keyExtractor={(item) => item}
        onDragEnd={({ data }) => { setTeamOrder(data); setSaved(false); }}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        style={styles.flatList}
      />

      {!isLocked && (
        <View style={styles.footer}>
          {saved && (
            <Text
              variant="labelMedium"
              style={{ color: theme.colors.primary, textAlign: 'center' }}
            >
              ✓ Predicción guardada
            </Text>
          )}
          <Button
            mode="contained"
            onPress={() => save()}
            loading={saving}
            disabled={saving || teamOrder.length === 0}
          >
            Guardar predicción
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  phaseRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4 },
  chip: { flex: 1 },
  hint: { textAlign: 'center', paddingHorizontal: 16, paddingBottom: 8, opacity: 0.6 },
  lockedNote: { textAlign: 'center', opacity: 0.5, paddingHorizontal: 16, paddingBottom: 8 },
  flatList: { flex: 1 },
  list: { padding: 12, gap: 6, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingLeft: 12,
    paddingVertical: 10,
  },
  pos: { width: 32, fontVariant: ['tabular-nums'] },
  teamName: { flex: 1 },
  handle: { padding: 12 },
  footer: { padding: 16, gap: 8 },
});
