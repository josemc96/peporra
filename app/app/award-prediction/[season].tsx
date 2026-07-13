import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  List,
  Surface,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { awardPredictionsApi, Award } from '@/api/awardPredictions';

export default function AwardPredictionScreen() {
  const { season } = useLocalSearchParams<{ season: string }>();
  const theme = useTheme();
  const qc = useQueryClient();

  const [award, setAward] = useState<Award>('pichichi');
  const [playerInput, setPlayerInput] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: prediction, isLoading: predLoading } = useQuery({
    queryKey: ['award-prediction', season, award],
    queryFn: () => awardPredictionsApi.get(season, award),
  });

  const { data: scorers, isLoading: scorersLoading } = useQuery({
    queryKey: ['scorers', season],
    queryFn: () => awardPredictionsApi.listScorers(season),
    enabled: award === 'pichichi',
    staleTime: 5 * 60 * 1000,
  });

  // Sync text input with existing prediction when tab/data changes
  useEffect(() => {
    setPlayerInput(prediction?.predictedPlayer ?? '');
    setSaved(false);
  }, [prediction, award]);

  const { mutate: save, isPending: saving, error } = useMutation({
    mutationFn: () => awardPredictionsApi.upsert(season, award, playerInput.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['award-prediction', season, award] });
      setSaved(true);
    },
  });

  const isLocked = prediction?.status === 'scored';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Award selector */}
      <View style={styles.tabRow}>
        <Chip selected={award === 'pichichi'} onPress={() => setAward('pichichi')} style={styles.chip}>
          🏆 Pichichi
        </Chip>
        <Chip selected={award === 'zamora'} onPress={() => setAward('zamora')} style={styles.chip}>
          🧤 Zamora
        </Chip>
      </View>

      <Text variant="titleMedium" style={styles.sectionTitle}>
        {award === 'pichichi' ? 'Máximo goleador' : 'Portero menos goleado'}
      </Text>

      {predLoading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : (
        <>
          {isLocked ? (
            <Surface style={styles.lockedBox} elevation={1}>
              <Text variant="bodyMedium" style={{ opacity: 0.6 }}>Predicción puntuada — solo lectura</Text>
              <Text variant="titleMedium" style={styles.lockedPlayer}>{prediction?.predictedPlayer}</Text>
            </Surface>
          ) : (
            <>
              <TextInput
                label={award === 'pichichi' ? 'Nombre del jugador' : 'Nombre del portero'}
                value={playerInput}
                onChangeText={(t) => { setPlayerInput(t); setSaved(false); }}
                mode="outlined"
                style={styles.input}
                autoCorrect={false}
              />
              {error && (
                <Text variant="labelSmall" style={{ color: theme.colors.error }}>
                  {(error as Error).message}
                </Text>
              )}
              {saved && (
                <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                  ✓ Predicción guardada
                </Text>
              )}
              <Button
                mode="contained"
                onPress={() => save()}
                loading={saving}
                disabled={saving || playerInput.trim().length === 0}
                style={styles.saveBtn}
              >
                Guardar predicción
              </Button>
            </>
          )}
        </>
      )}

      {/* Scorers reference list (Pichichi only) */}
      {award === 'pichichi' && (
        <>
          <Divider style={styles.divider} />
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Clasificación actual de goleadores
          </Text>
          {scorersLoading && <ActivityIndicator style={{ marginVertical: 12 }} />}
          {!scorersLoading && scorers && scorers.length === 0 && (
            <Text style={{ opacity: 0.5 }}>Sin datos de goleadores sincronizados todavía.</Text>
          )}
          {!scorersLoading && scorers && scorers.map((s, i) => (
            <List.Item
              key={s._id}
              title={s.playerName}
              description={`${s.team} · ${s.goals} goles${s.playedMatches ? ` en ${s.playedMatches} partidos` : ''}`}
              left={() => (
                <Text
                  variant="titleMedium"
                  style={[styles.scorerPos, { color: theme.colors.onSurfaceVariant }]}
                >
                  {i + 1}
                </Text>
              )}
              right={() =>
                !isLocked ? (
                  <Button
                    compact
                    mode="text"
                    onPress={() => { setPlayerInput(s.playerName); setSaved(false); }}
                  >
                    Elegir
                  </Button>
                ) : null
              }
            />
          ))}
        </>
      )}

      {award === 'zamora' && (
        <>
          <Divider style={styles.divider} />
          <Text variant="bodySmall" style={styles.zamoraNote}>
            La clasificación del Zamora no está disponible a través de la API gratuita.
            Introduce el nombre del portero que crees que recibirá menos goles al final de la temporada.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1 },
  sectionTitle: { marginTop: 4 },
  input: { marginTop: 4 },
  saveBtn: { marginTop: 4 },
  lockedBox: { borderRadius: 8, padding: 16, gap: 8 },
  lockedPlayer: { fontWeight: 'bold' },
  divider: { marginVertical: 8 },
  scorerPos: { width: 32, textAlign: 'center', alignSelf: 'center' },
  zamoraNote: { opacity: 0.6, fontStyle: 'italic' },
});
