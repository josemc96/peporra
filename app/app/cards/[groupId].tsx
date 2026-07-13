import { useState } from 'react';
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

import { cardsApi, CardKey, CARD_LABELS, CARD_DESCRIPTIONS, CARD_EMOJI, CardDeal } from '@/api/cards';
import { predictionsApi, Match } from '@/api/predictions';
import { groupsApi, GroupMember } from '@/api/groups';
import { ApiError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';

// Cards that need the user to pick a match (same matchday, before kickoff)
const NEEDS_MATCH: CardKey[] = ['la_mina', 'el_autobus', 'el_doblete', 'la_roja', 'la_lesion', 'rueda_prensa', 'me_la_juego', 'el_espia'];
// Cards that need a rival picked
const NEEDS_RIVAL: CardKey[] = ['la_roja', 'la_lesion', 'rueda_prensa', 'la_aficion', 'el_var'];
// Cards that need a finished match (el_var only)
const NEEDS_FINISHED_MATCH: CardKey[] = ['el_var'];

// ── Match picker list ───────────────────────────────────────────────────────

function MatchPicker({
  matches,
  selectedId,
  onSelect,
}: {
  matches: Match[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.pickerBox}>
      {matches.map((m) => (
        <List.Item
          key={m._id}
          title={`${m.homeTeam} vs ${m.awayTeam}`}
          description={new Date(m.startTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
          onPress={() => onSelect(m._id)}
          right={() => selectedId === m._id ? <List.Icon icon="check-circle" color={theme.colors.primary} /> : null}
          style={selectedId === m._id ? { backgroundColor: theme.colors.primaryContainer, borderRadius: 8 } : undefined}
        />
      ))}
    </View>
  );
}

// ── Rival picker list ───────────────────────────────────────────────────────

function RivalPicker({
  members,
  selectedId,
  onSelect,
  excludeId,
}: {
  members: GroupMember[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeId: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.pickerBox}>
      {members.filter((m) => m._id !== excludeId).map((m) => (
        <List.Item
          key={m._id}
          title={m.alias}
          description={m.email}
          onPress={() => onSelect(m._id)}
          right={() => selectedId === m._id ? <List.Icon icon="check-circle" color={theme.colors.primary} /> : null}
          style={selectedId === m._id ? { backgroundColor: theme.colors.primaryContainer, borderRadius: 8 } : undefined}
        />
      ))}
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function CardPlayScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { season, matchday } = useLocalSearchParams<{ season: string; matchday: string }>();
  const { user } = useAuth();
  const theme = useTheme();
  const qc = useQueryClient();

  const matchdayNum = parseInt(matchday ?? '1', 10);

  // Inputs
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedRivalId, setSelectedRivalId] = useState<string | null>(null);
  const [varSide, setVarSide] = useState<'home' | 'away'>('home');
  const [varDelta, setVarDelta] = useState<1 | -1>(1);
  const [betAmount, setBetAmount] = useState('');
  const [ruedaAmount, setRuedaAmount] = useState('');
  const [spyCopiedId, setSpyCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Data fetches ──────────────────────────────────────────────────────────

  const { data: dealData, isLoading: dealLoading } = useQuery({
    queryKey: ['my-deal', groupId, season, matchday],
    queryFn: () => cardsApi.getMyDeal(groupId, season, matchdayNum),
    enabled: !!groupId && !!season && !!matchday,
  });

  const deal = dealData?.deal ?? null;
  const card = deal?.card ?? null;

  const needsMatch = card ? NEEDS_MATCH.includes(card) : false;
  const needsRival = card ? NEEDS_RIVAL.includes(card) : false;
  const needsFinished = card ? NEEDS_FINISHED_MATCH.includes(card) : false;

  const { data: matchesData } = useQuery({
    queryKey: ['matches', season, matchdayNum],
    queryFn: () => predictionsApi.listMatches(season).then((ms) =>
      ms.filter((m) =>
        m.competition === 'la_liga' && m.matchday === matchdayNum &&
        (needsFinished ? m.status === 'finished' : new Date() < new Date(m.startTime))
      )
    ),
    enabled: !!season && needsMatch && deal?.status === 'pending',
  });
  const availableMatches = matchesData ?? [];

  const { data: groupData } = useQuery({
    queryKey: ['group-detail', groupId],
    queryFn: () => groupsApi.get(groupId),
    enabled: !!groupId && needsRival && deal?.status === 'pending',
  });

  const { data: cardConfig } = useQuery({
    queryKey: ['card-config', groupId, season],
    queryFn: () => cardsApi.getConfig(groupId, season),
    enabled: card === 'me_la_juego' && deal?.status === 'pending',
  });

  const melaLimit = cardConfig?.config?.melaJuegoLimit ?? 5;

  // ── Spy endpoint (el_espia) ───────────────────────────────────────────────

  const { data: spyData, mutate: doSpy, isPending: spying, isSuccess: spied } = useMutation({
    mutationFn: () => cardsApi.spyMatch(groupId, selectedMatchId!),
    onError: (e) => setErrorMsg(e instanceof ApiError ? e.message : 'Error al espiar'),
  });

  // ── Play mutation ─────────────────────────────────────────────────────────

  const { mutate: playCard, isPending: playing } = useMutation({
    mutationFn: () => {
      if (!deal) throw new Error('Sin carta');
      const body: Parameters<typeof cardsApi.playCard>[1] = { dealId: deal._id };
      if (selectedMatchId) body.matchId = selectedMatchId;
      if (selectedRivalId) body.targetUserId = selectedRivalId;

      if (card === 'el_var') body.params = { side: varSide, delta: varDelta };
      if (card === 'me_la_juego') body.params = { amount: parseInt(betAmount, 10) };
      if (card === 'rueda_prensa') body.params = { amount: parseInt(ruedaAmount, 10) };
      if (card === 'el_espia' && spyCopiedId) body.params = { copiedUserId: spyCopiedId };

      return cardsApi.playCard(groupId, body);
    },
    onSuccess: () => {
      setSuccessMsg('Carta jugada con éxito');
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ['my-deal', groupId, season, matchday] });
    },
    onError: (e) => {
      setErrorMsg(e instanceof ApiError ? e.message : 'Error al jugar la carta');
    },
  });

  // ── Can play validation ───────────────────────────────────────────────────

  function canPlay(): boolean {
    if (!card || !deal || deal.status !== 'pending') return false;
    if (needsMatch && !selectedMatchId) return false;
    if (needsRival && !selectedRivalId) return false;
    if (card === 'el_var') return !!selectedMatchId && !!selectedRivalId;
    if (card === 'me_la_juego') {
      const n = parseInt(betAmount, 10);
      return !!selectedMatchId && !isNaN(n) && n >= 1 && n <= melaLimit;
    }
    if (card === 'rueda_prensa') {
      const n = parseInt(ruedaAmount, 10);
      return !!selectedMatchId && !!selectedRivalId && !isNaN(n) && n >= 1;
    }
    if (card === 'el_espia') return !!selectedMatchId;
    return true;
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const selectedMatch = availableMatches.find((m) => m._id === selectedMatchId);
  const selectedRival = groupData?.members.find((m) => m._id === selectedRivalId);

  if (dealLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.centered}>
        <Text variant="bodyLarge" style={{ opacity: 0.5 }}>
          Sin carta en J{matchdayNum}
        </Text>
        <Text variant="bodySmall" style={{ opacity: 0.4, marginTop: 8, textAlign: 'center' }}>
          Las cartas se reparten automáticamente 24h antes del primer partido de cada jornada.
        </Text>
      </View>
    );
  }

  const statusColor = deal.status === 'played'
    ? theme.colors.primary
    : deal.status === 'expired'
      ? theme.colors.onSurfaceDisabled
      : theme.colors.onSurface;

  const statusLabel = deal.status === 'played' ? 'Jugada' : deal.status === 'expired' ? 'Expirada' : 'Sin jugar';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* ── Card display ── */}
      <Surface style={styles.cardSurface} elevation={3}>
        <Text style={styles.cardEmoji}>{CARD_EMOJI[deal.card]}</Text>
        <Text variant="headlineSmall" style={styles.cardName}>{CARD_LABELS[deal.card]}</Text>
        <Text variant="bodyMedium" style={styles.cardDesc}>{CARD_DESCRIPTIONS[deal.card]}</Text>
        <View style={styles.statusRow}>
          <Text variant="labelMedium" style={{ color: statusColor }}>● {statusLabel}</Text>
          <Text variant="labelSmall" style={{ opacity: 0.5 }}>J{matchdayNum}</Text>
        </View>
      </Surface>

      {/* ── Already played / expired ── */}
      {deal.status === 'played' && (
        <Text variant="bodyMedium" style={styles.playedNote}>
          Ya jugaste esta carta para la jornada {matchdayNum}.
        </Text>
      )}
      {deal.status === 'expired' && (
        <Text variant="bodyMedium" style={[styles.playedNote, { color: theme.colors.onSurfaceDisabled }]}>
          La jornada ya terminó sin que jugaras esta carta.
        </Text>
      )}

      {successMsg && (
        <Text variant="bodyMedium" style={[styles.playedNote, { color: theme.colors.primary }]}>
          ✓ {successMsg}
        </Text>
      )}

      {/* ── Play form (only if pending) ── */}
      {deal.status === 'pending' && !successMsg && (
        <>
          {/* Rival picker */}
          {needsRival && (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                {card === 'la_aficion' ? 'Apoya a...' : card === 'el_var' ? 'Rival a corregir' : 'Rival objetivo'}
              </Text>
              {!groupData ? <ActivityIndicator style={{ marginTop: 8 }} /> : (
                <RivalPicker
                  members={groupData.members}
                  selectedId={selectedRivalId}
                  onSelect={setSelectedRivalId}
                  excludeId={user?.id ?? ''}
                />
              )}
              <Divider style={styles.divider} />
            </>
          )}

          {/* Match picker */}
          {needsMatch && (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                {needsFinished ? 'Partido a revisar (terminado)' : card === 'el_espia' ? 'Partido a espiar' : 'Partido objetivo'}
              </Text>
              {availableMatches.length === 0 ? (
                <Text style={{ opacity: 0.5 }}>
                  {needsFinished
                    ? 'Sin partidos terminados en esta jornada.'
                    : 'Sin partidos disponibles (todos han comenzado o la jornada no ha llegado).'}
                </Text>
              ) : (
                <MatchPicker
                  matches={availableMatches}
                  selectedId={selectedMatchId}
                  onSelect={(id) => { setSelectedMatchId(id); setSpyCopiedId(null); }}
                />
              )}
              <Divider style={styles.divider} />
            </>
          )}

          {/* el_var: side + delta */}
          {card === 'el_var' && selectedMatchId && selectedRivalId && (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>Ajuste del VAR</Text>
              <View style={styles.chipRow}>
                <Chip selected={varSide === 'home'} onPress={() => setVarSide('home')} style={{ flex: 1 }}>Local</Chip>
                <Chip selected={varSide === 'away'} onPress={() => setVarSide('away')} style={{ flex: 1 }}>Visitante</Chip>
              </View>
              <View style={styles.chipRow}>
                <Chip selected={varDelta === 1} onPress={() => setVarDelta(1)} style={{ flex: 1 }}>+1 gol</Chip>
                <Chip selected={varDelta === -1} onPress={() => setVarDelta(-1)} style={{ flex: 1 }}>-1 gol</Chip>
              </View>
              {selectedMatch && (
                <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 4 }}>
                  Modificarás la predicción de {selectedRival?.alias ?? '?'} en {selectedMatch.homeTeam} vs {selectedMatch.awayTeam}
                </Text>
              )}
              <Divider style={styles.divider} />
            </>
          )}

          {/* me_la_juego: bet amount */}
          {card === 'me_la_juego' && selectedMatchId && (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>Apuesta (máx. {melaLimit} pts)</Text>
              <TextInput
                label="Puntos a apostar"
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="numeric"
                mode="outlined"
                dense
                placeholder={`1 – ${melaLimit}`}
              />
              <Divider style={styles.divider} />
            </>
          )}

          {/* rueda_prensa: extra points */}
          {card === 'rueda_prensa' && selectedMatchId && selectedRivalId && (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>Puntos extra</Text>
              <TextInput
                label="Puntos a añadir"
                value={ruedaAmount}
                onChangeText={setRuedaAmount}
                keyboardType="numeric"
                mode="outlined"
                dense
                placeholder="ej. 3"
              />
              <Divider style={styles.divider} />
            </>
          )}

          {/* el_espia: spy button + results */}
          {card === 'el_espia' && selectedMatchId && (
            <>
              <Button
                mode="outlined"
                icon="eye"
                onPress={() => doSpy()}
                loading={spying}
                disabled={spying}
                style={{ marginBottom: 8 }}
              >
                Ver predicciones del partido
              </Button>

              {spied && spyData && (
                <>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Predicciones de tus rivales</Text>
                  {spyData.predictions.length === 0 && (
                    <Text style={{ opacity: 0.5 }}>Nadie ha predicho este partido todavía.</Text>
                  )}
                  {spyData.predictions.map((p) => (
                    <List.Item
                      key={p.user.id}
                      title={p.user.alias}
                      description={`${p.predictedHome} - ${p.predictedAway}`}
                      onPress={() => setSpyCopiedId(spyCopiedId === p.user.id ? null : p.user.id)}
                      right={() => spyCopiedId === p.user.id
                        ? <List.Icon icon="content-copy" color={theme.colors.primary} />
                        : null
                      }
                      style={spyCopiedId === p.user.id
                        ? { backgroundColor: theme.colors.primaryContainer, borderRadius: 8 }
                        : undefined
                      }
                    />
                  ))}
                  {spyCopiedId && (
                    <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 4 }}>
                      Al jugar la carta copiarás la predicción de {spyData.predictions.find((p) => p.user.id === spyCopiedId)?.user.alias}.
                      Si no seleccionas nadie, solo consumes la carta sin copiar.
                    </Text>
                  )}
                </>
              )}
              <Divider style={styles.divider} />
            </>
          )}

          {/* Error */}
          {errorMsg && (
            <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>{errorMsg}</Text>
          )}

          {/* Play button */}
          <Button
            mode="contained"
            icon="cards-playing"
            onPress={() => { setErrorMsg(null); playCard(); }}
            loading={playing}
            disabled={playing || !canPlay()}
            style={styles.playBtn}
          >
            Jugar carta
          </Button>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  cardSurface: { borderRadius: 16, padding: 20, alignItems: 'center', gap: 6 },
  cardEmoji: { fontSize: 48 },
  cardName: { fontWeight: '700', textAlign: 'center' },
  cardDesc: { textAlign: 'center', opacity: 0.7 },
  statusRow: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 4 },
  playedNote: { textAlign: 'center', opacity: 0.7, marginVertical: 4 },
  sectionTitle: { fontWeight: '600', marginTop: 4 },
  divider: { marginVertical: 8 },
  pickerBox: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  playBtn: { marginTop: 8 },
});
