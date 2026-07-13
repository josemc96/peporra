import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  IconButton,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { standingsPredictionsApi } from '@/api/standingsPredictions';

type Phase = 'ida' | 'vuelta';

export default function StandingsPredictionScreen() {
  const { season } = useLocalSearchParams<{ season: string }>();
  const theme = useTheme();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>('ida');
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
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
    setSelectedIdx(null);
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

  function swap(a: number, b: number) {
    setTeamOrder((prev) => {
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    setSelectedIdx(null);
    setSaved(false);
  }

  function handleRowTap(idx: number) {
    if (selectedIdx === null) {
      setSelectedIdx(idx);
    } else if (selectedIdx === idx) {
      setSelectedIdx(null);
    } else {
      swap(selectedIdx, idx);
    }
  }

  const isLoading = teamsLoading || predLoading;
  const isLocked = prediction?.status === 'scored';

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

      {selectedIdx !== null && (
        <Text variant="labelMedium" style={[styles.hint, { color: theme.colors.primary }]}>
          «{teamOrder[selectedIdx]}» seleccionado — toca otro equipo para intercambiar
        </Text>
      )}

      {isLocked && (
        <Text variant="labelSmall" style={styles.lockedNote}>
          Predicción puntuada — solo lectura
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {teamOrder.map((team, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <TouchableOpacity
              key={team}
              activeOpacity={isLocked ? 1 : 0.7}
              onPress={isLocked ? undefined : () => handleRowTap(idx)}
            >
              <Surface
                style={[
                  styles.row,
                  isSelected && { backgroundColor: theme.colors.primaryContainer },
                ]}
                elevation={1}
              >
                <Text
                  variant="titleMedium"
                  style={[styles.pos, { color: theme.colors.onSurfaceVariant }]}
                >
                  {idx + 1}
                </Text>
                <Text variant="bodyLarge" style={styles.teamName}>
                  {team}
                </Text>
                {!isLocked && (
                  <View style={styles.arrows}>
                    <IconButton
                      icon="chevron-up"
                      size={20}
                      disabled={idx === 0}
                      onPress={(e) => { e.stopPropagation?.(); swap(idx - 1, idx); }}
                    />
                    <IconButton
                      icon="chevron-down"
                      size={20}
                      disabled={idx === teamOrder.length - 1}
                      onPress={(e) => { e.stopPropagation?.(); swap(idx, idx + 1); }}
                    />
                  </View>
                )}
              </Surface>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!isLocked && (
        <View style={styles.footer}>
          {saved && (
            <Text variant="labelMedium" style={{ color: theme.colors.primary, textAlign: 'center' }}>
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
  phaseRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  chip: { flex: 1 },
  hint: { textAlign: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  lockedNote: { textAlign: 'center', opacity: 0.5, paddingHorizontal: 16, paddingBottom: 4 },
  list: { padding: 12, gap: 6, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
  },
  pos: { width: 32, fontVariant: ['tabular-nums'] },
  teamName: { flex: 1 },
  arrows: { flexDirection: 'row' },
  footer: { padding: 16, gap: 8 },
});
