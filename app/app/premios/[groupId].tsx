import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Avatar, Button, Chip, Divider,
  List, Surface, Text, TextInput, useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGroupApi } from '@/api/adminGroup';
import { apiFetch } from '@/api/client';
import { awardPredictionsApi, Award } from '@/api/awardPredictions';
import { colors } from '@/config/theme';

// ─── Premios section ──────────────────────────────────────────────────────────

function PremiosSection({
  groupId, season, isSeasonLocked,
  hasPichichi, hasZamora,
}: {
  groupId: string; season: string; isSeasonLocked: boolean;
  hasPichichi: boolean; hasZamora: boolean;
}) {
  const theme = useTheme();
  const qc = useQueryClient();
  const awards: Award[] = [
    ...(hasPichichi ? ['pichichi' as Award] : []),
    ...(hasZamora ? ['zamora' as Award] : []),
  ];
  const [activeAward, setActiveAward] = useState<Award>(awards[0] ?? 'pichichi');
  const [playerInput, setPlayerInput] = useState('');
  const [saved, setSaved] = useState(false);

  // Mi predicción actual (siempre, para pre-rellenar el input)
  const { data: myPrediction, isLoading: predLoading } = useQuery({
    queryKey: ['my-award-prediction', season, activeAward],
    queryFn: () => awardPredictionsApi.get(season, activeAward),
    enabled: !!season,
  });

  // Goleadores (solo Pichichi, antes del kickoff como referencia)
  const { data: scorers } = useQuery({
    queryKey: ['scorers', season],
    queryFn: () => awardPredictionsApi.listScorers(season),
    enabled: !isSeasonLocked && activeAward === 'pichichi',
    staleTime: 5 * 60 * 1000,
  });

  // Apuestas del grupo (solo después del kickoff)
  const { data: groupPredictions, isLoading: groupLoading } = useQuery({
    queryKey: ['group-award-predictions', groupId, season, activeAward],
    queryFn: () => awardPredictionsApi.getGroupPredictions(groupId, season, activeAward),
    enabled: isSeasonLocked && !!groupId,
  });

  // Sincronizar input con la predicción cargada
  useEffect(() => {
    setPlayerInput(myPrediction?.predictedPlayer ?? '');
    setSaved(false);
  }, [myPrediction, activeAward]);

  const { mutate: save, isPending: saving, error: saveError } = useMutation({
    mutationFn: () => awardPredictionsApi.upsert(season, activeAward, playerInput.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-award-prediction', season, activeAward] });
      setSaved(true);
    },
  });

  return (
    <View style={styles.premiosContainer}>
      {/* Sub-tabs Pichichi / Zamora */}
      {awards.length > 1 && (
        <View style={styles.subTabs}>
          {awards.map((a) => (
            <Chip key={a} selected={activeAward === a} onPress={() => setActiveAward(a)} style={styles.chip}>
              {a === 'pichichi' ? '⚽ Pichichi' : '🧤 Zamora'}
            </Chip>
          ))}
        </View>
      )}

      {!isSeasonLocked ? (
        /* ── Antes del kickoff: formulario de edición inline ── */
        predLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : (
          <View style={styles.premiosForm}>
            <TextInput
              label={activeAward === 'pichichi' ? 'Nombre del jugador' : 'Nombre del portero'}
              value={playerInput}
              onChangeText={(t) => { setPlayerInput(t); setSaved(false); }}
              mode="outlined"
              autoCorrect={false}
            />
            {!!saveError && (
              <Text variant="labelSmall" style={{ color: theme.colors.error }}>
                {(saveError as Error).message}
              </Text>
            )}
            {saved && (
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                Predicción guardada
              </Text>
            )}
            <Button
              mode="contained"
              onPress={() => save()}
              loading={saving}
              disabled={saving || playerInput.trim().length === 0}
            >
              Guardar predicción
            </Button>

            {/* Lista de goleadores como referencia (solo Pichichi) */}
            {activeAward === 'pichichi' && !!scorers?.length && (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <Text variant="labelMedium" style={{ opacity: 0.6 }}>Goleadores actuales</Text>
                {scorers.map((s, i) => (
                  <List.Item
                    key={s._id}
                    title={s.playerName}
                    description={`${s.team} · ${s.goals} goles`}
                    left={() => (
                      <Text variant="bodyMedium" style={styles.scorerPos}>{i + 1}</Text>
                    )}
                    right={() => (
                      <Button compact mode="text" onPress={() => { setPlayerInput(s.playerName); setSaved(false); }}>
                        Elegir
                      </Button>
                    )}
                  />
                ))}
              </>
            )}

            {activeAward === 'zamora' && (
              <Text variant="bodySmall" style={styles.zamoraNote}>
                La clasificación del Zamora no está disponible en la API gratuita. Introduce el nombre del portero que crees que recibirá menos goles.
              </Text>
            )}
          </View>
        )
      ) : (
        /* ── Después del kickoff: lista de apuestas de todos ── */
        groupLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : !groupPredictions?.length ? (
          <Text style={styles.emptyText}>
            Ningún miembro ha apostado por {activeAward === 'pichichi' ? 'el Pichichi' : 'el Zamora'}.
          </Text>
        ) : (
          <View style={styles.predList}>
            {groupPredictions.map((p) => (
              <Surface key={p._id} style={styles.predRow} elevation={1}>
                <Avatar.Text size={32} label={(p.user.alias ?? '?').slice(0, 2).toUpperCase()} style={styles.avatar} />
                <View style={styles.userInfo}>
                  <Text variant="bodyMedium" style={styles.alias}>{p.user.alias ?? '?'}</Text>
                </View>
                <Text variant="titleSmall" style={styles.predPlayer}>{p.predictedPlayer}</Text>
              </Surface>
            ))}
          </View>
        )
      )}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function PremiosScreen() {
  const { groupId, season } = useLocalSearchParams<{ groupId: string; season: string }>();

  const { data: settings } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: seasonStatus } = useQuery({
    queryKey: ['season-locked', season],
    queryFn: () => apiFetch<{ locked: boolean }>(`/season/is-locked?season=${encodeURIComponent(season)}`),
    enabled: !!season,
    staleTime: 5 * 60 * 1000,
  });
  const isSeasonLocked = seasonStatus?.locked ?? false;

  const feats = settings?.enabledFeatures ?? [];
  const hasPichichi = feats.includes('pichichi');
  const hasZamora = feats.includes('zamora');

  if (!hasPichichi && !hasZamora) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Esta peña no tiene activados los premios todavía.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <PremiosSection
        groupId={groupId}
        season={season}
        isSeasonLocked={isSeasonLocked}
        hasPichichi={hasPichichi}
        hasZamora={hasZamora}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 16, gap: 10, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: colors.bg },

  // Premios
  premiosContainer: { gap: 12 },
  premiosForm: { gap: 10 },
  subTabs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  chip: { flex: 1 },
  scorerPos: { width: 28, textAlign: 'center', alignSelf: 'center', opacity: 0.6 },
  zamoraNote: { opacity: 0.5, fontStyle: 'italic' },
  predList: { gap: 8 },
  predRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, padding: 10, gap: 10,
  },
  avatar: { backgroundColor: '#232B42' },
  userInfo: { flex: 1 },
  alias: { fontWeight: '500' },
  predPlayer: { fontWeight: '700', color: '#C04A1A' },
  emptyText: { textAlign: 'center', opacity: 0.5 },
});
