import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Icon,
  List,
  Surface,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { awardPredictionsApi, Award } from '@/api/awardPredictions';
import { adminGroupApi } from '@/api/adminGroup';
import { colors } from '@/config/theme';

export default function AwardPredictionScreen() {
  const { season, groupId } = useLocalSearchParams<{ season: string; groupId?: string }>();
  const theme = useTheme();
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId!, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });
  const feats = settings?.enabledFeatures ?? [];
  const showPichichi = !groupId || feats.includes('pichichi');
  const showZamora = !groupId || feats.includes('zamora');

  const defaultAward: Award = showPichichi ? 'pichichi' : 'zamora';
  const [award, setAward] = useState<Award>(defaultAward);
  const [playerInput, setPlayerInput] = useState('');
  const [editing, setEditing] = useState(false);

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

  useEffect(() => {
    setPlayerInput(prediction?.predictedPlayer ?? '');
    setEditing(false);
  }, [prediction, award]);

  const { mutate: save, isPending: saving, error } = useMutation({
    mutationFn: () => awardPredictionsApi.upsert(season, award, playerInput.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['award-prediction', season, award] });
      setEditing(false);
    },
  });

  const isScored = prediction?.status === 'scored';
  const hasPrediction = !!prediction;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Selector Pichichi / Zamora */}
      {showPichichi && showZamora && (
        <View style={styles.tabRow}>
          <Chip selected={award === 'pichichi'} onPress={() => setAward('pichichi')} style={styles.chip}>
            🏆 Pichichi
          </Chip>
          <Chip selected={award === 'zamora'} onPress={() => setAward('zamora')} style={styles.chip}>
            🧤 Zamora
          </Chip>
        </View>
      )}

      <Text variant="titleMedium" style={styles.sectionTitle}>
        {award === 'pichichi' ? 'Máximo goleador' : 'Portero menos goleado'}
      </Text>

      {predLoading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : (
        <>
          {/* Estado: puntuada — solo lectura */}
          {isScored && (
            <Surface style={styles.predictionCard} elevation={1}>
              <View style={styles.predictionCardInner}>
                <Icon source="check-circle" size={20} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelSmall" style={styles.predictionCardLabel}>Tu predicción · Puntuada</Text>
                  <Text variant="titleMedium" style={styles.predictionCardPlayer}>
                    {prediction?.predictedPlayer}
                  </Text>
                </View>
              </View>
            </Surface>
          )}

          {/* Estado: predicción guardada, pendiente — vista */}
          {!isScored && hasPrediction && !editing && (
            <Surface style={styles.predictionCard} elevation={1}>
              <View style={styles.predictionCardInner}>
                <Icon source="account-check" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelSmall" style={styles.predictionCardLabel}>Tu predicción</Text>
                  <Text variant="titleMedium" style={styles.predictionCardPlayer}>
                    {prediction.predictedPlayer}
                  </Text>
                </View>
                <Button
                  mode="text"
                  compact
                  onPress={() => setEditing(true)}
                >
                  Editar
                </Button>
              </View>
            </Surface>
          )}

          {/* Estado: sin predicción o editando */}
          {!isScored && (!hasPrediction || editing) && (
            <View style={styles.editBlock}>
              <TextInput
                label={award === 'pichichi' ? 'Nombre del jugador' : 'Nombre del portero'}
                value={playerInput}
                onChangeText={(t) => setPlayerInput(t)}
                mode="outlined"
                style={styles.input}
                autoCorrect={false}
                autoFocus={editing}
              />
              {error && (
                <Text variant="labelSmall" style={{ color: theme.colors.error }}>
                  {(error as Error).message}
                </Text>
              )}
              <View style={styles.editActions}>
                {editing && (
                  <Button
                    mode="outlined"
                    onPress={() => { setPlayerInput(prediction?.predictedPlayer ?? ''); setEditing(false); }}
                    style={styles.editBtn}
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  mode="contained"
                  onPress={() => save()}
                  loading={saving}
                  disabled={saving || playerInput.trim().length === 0}
                  style={[styles.editBtn, { flex: 1 }]}
                >
                  Guardar predicción
                </Button>
              </View>
            </View>
          )}
        </>
      )}

      {/* Lista de goleadores (solo Pichichi) */}
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
                !isScored ? (
                  <Button
                    compact
                    mode="text"
                    onPress={() => { setPlayerInput(s.playerName); setEditing(true); }}
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
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1 },
  sectionTitle: { marginTop: 4 },

  predictionCard: { borderRadius: 10, padding: 16 },
  predictionCardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  predictionCardLabel: { opacity: 0.55, marginBottom: 2 },
  predictionCardPlayer: { fontWeight: '700' },

  editBlock: { gap: 10 },
  input: {},
  editActions: { flexDirection: 'row', gap: 10 },
  editBtn: {},

  divider: { marginVertical: 8 },
  scorerPos: { width: 32, textAlign: 'center', alignSelf: 'center' },
  zamoraNote: { opacity: 0.6, fontStyle: 'italic' },
});
