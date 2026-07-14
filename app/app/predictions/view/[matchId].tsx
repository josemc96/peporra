import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Divider, Surface, Text, useTheme } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { matchVisibilityApi } from '@/api/matchVisibility';
import { cardsApi, ActiveCardPlay, CardKey, CARD_LABELS, CARD_EMOJI } from '@/api/cards';
import { useAuth } from '@/context/AuthContext';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function UserChip({ alias, isMe, points, cards }: {
  alias: string;
  isMe: boolean;
  points?: number | null;
  cards?: CardKey[];
}) {
  const theme = useTheme();
  return (
    <View style={[styles.userChip, isMe && { borderColor: theme.colors.primary, borderWidth: 1.5 }]}>
      <Avatar.Text size={20} label={alias.slice(0, 2).toUpperCase()} style={styles.chipAvatar} />
      <Text variant="labelMedium" style={isMe ? { color: theme.colors.primary, fontWeight: '700' } : undefined}>
        {alias}{isMe ? ' (tú)' : ''}
      </Text>
      {cards && cards.length > 0 && (
        <Text style={styles.chipCardEmojis}>
          {cards.map((c) => CARD_EMOJI[c]).join('')}
        </Text>
      )}
      {points != null && (
        <Text variant="labelSmall" style={[styles.userPts, points === 0 && styles.userPtsZero]}>
          {points} pts
        </Text>
      )}
    </View>
  );
}

function cardPlayDescription(play: ActiveCardPlay): string {
  const card = play.deal.card as CardKey;
  const owner = play.deal.user.alias;
  const target = play.targetUser?.alias;
  const { side, delta, amount } = play.params ?? {};

  switch (card) {
    case 'la_mina':     return `${owner} plantó la mina — quien tenga el mismo resultado puntúa 0`;
    case 'la_roja':     return `${owner} le puso tarjeta roja a ${target ?? '?'} — pierde todos sus puntos`;
    case 'la_lesion':   return `${owner} lesionó a ${target ?? '?'} — la mitad de sus puntos`;
    case 'el_doblete':  return `${owner} activó el doblete — sus puntos base se duplican`;
    case 'el_autobus':  return `${owner} subió al autobús — inmune y garantiza mínimo 1 pt`;
    case 'el_var': {
      const sideLabel = side === 'home' ? 'local' : 'visitante';
      const deltaStr  = delta === 1 ? '+1' : '-1';
      return `${owner} usó el VAR en ${target ?? '?'}: gol ${sideLabel} ${deltaStr}`;
    }
    case 'rueda_prensa': return `${owner} convocó rueda de prensa de ${target ?? '?'} — su predicción es visible para toda la peña`;
    case 'me_la_juego':  return `${owner} apostó ${amount ?? '?'} pts — gana si acierta resultado exacto`;
    case 'el_espia':     return `${owner} espió las predicciones de este partido`;
    default:             return `${owner} jugó ${CARD_LABELS[card] ?? card}`;
  }
}

function CardPlayRow({ play, myId }: { play: ActiveCardPlay; myId: string }) {
  const theme = useTheme();
  const card = play.deal.card as CardKey;
  const isMe = play.deal.user._id === myId || play.targetUser?._id === myId;

  return (
    <View style={[styles.cardPlayRow, isMe && { backgroundColor: theme.colors.primaryContainer, borderRadius: 8 }]}>
      <Text style={styles.cardPlayEmoji}>{CARD_EMOJI[card] ?? '🃏'}</Text>
      <View style={{ flex: 1 }}>
        <Text variant="labelMedium" style={{ fontWeight: '700' }}>{CARD_LABELS[card]}</Text>
        <Text variant="bodySmall" style={{ opacity: 0.7 }}>{cardPlayDescription(play)}</Text>
      </View>
    </View>
  );
}

export default function MatchPredictionViewScreen() {
  const { matchId, groupId, season, matchday, homeTeam, awayTeam, startTime, homeScore, awayScore } =
    useLocalSearchParams<{
      matchId: string;
      groupId: string;
      season?: string;
      matchday?: string;
      homeTeam: string;
      awayTeam: string;
      startTime: string;
      homeScore?: string;
      awayScore?: string;
    }>();

  const { user } = useAuth();
  const theme = useTheme();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['match-visibility', groupId, matchId],
    queryFn: () => matchVisibilityApi.get(groupId, matchId),
    refetchInterval: 60_000,
  });

  const matchdayNum = matchday ? parseInt(matchday, 10) : null;
  const { data: cardPlaysData } = useQuery({
    queryKey: ['card-plays', groupId, season, matchday],
    queryFn: () => cardsApi.getActiveCardPlays(groupId, season!, matchdayNum!),
    enabled: !!groupId && !!season && !!matchdayNum,
    refetchInterval: 60_000,
  });

  // Solo mostrar las cartas que apuntaron a ESTE partido
  const matchCardPlays = (cardPlaysData?.plays ?? []).filter(
    (p) => p.targetMatch?._id === matchId
  );

  // userId → cards que le afectan en este partido (solo el receptor del efecto)
  const cardsByUser = useMemo(() => {
    const map = new Map<string, CardKey[]>();
    const add = (userId: string, card: CardKey) => {
      if (!map.has(userId)) map.set(userId, []);
      map.get(userId)!.push(card);
    };

    for (const play of matchCardPlays) {
      const card = play.deal.card;
      const ownerId = play.deal.user._id;
      const targetId = play.targetUser?._id;

      switch (card) {
        case 'la_roja':
        case 'la_lesion':
        case 'el_var':
        case 'rueda_prensa':
        case 'la_aficion':
          if (targetId) add(targetId, card);
          break;
        case 'el_autobus':
        case 'el_doblete':
        case 'me_la_juego':
          add(ownerId, card);
          break;
        case 'la_mina':
          // víctimas = resto de usuarios del mismo grupo de predicción que el dueño
          if (data?.phase === 'live' || data?.phase === 'finished') {
            for (const g of data.groups) {
              if (g.users.some((u) => u.id === ownerId)) {
                for (const u of g.users) {
                  if (u.id !== ownerId) add(u.id, card);
                }
                break;
              }
            }
          }
          break;
        // el_espia: no tiene efecto visible en puntos de nadie
        default:
          break;
      }
    }
    return map;
  }, [matchCardPlays, data]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Header del partido */}
      <Surface style={styles.matchHeader} elevation={1}>
        <Text variant="labelSmall" style={styles.date}>{formatDate(startTime)}</Text>
        <View style={styles.teamsRow}>
          <Text variant="titleMedium" style={styles.team} numberOfLines={1}>{homeTeam}</Text>
          {homeScore != null && awayScore != null ? (
            <Text variant="headlineSmall" style={styles.score}>{homeScore} - {awayScore}</Text>
          ) : (
            <Text variant="titleMedium" style={styles.vsText}>vs</Text>
          )}
          <Text variant="titleMedium" style={[styles.team, { textAlign: 'right' }]} numberOfLines={1}>{awayTeam}</Text>
        </View>
      </Surface>

      {isLoading && <ActivityIndicator style={{ marginTop: 32 }} />}
      {isError && <Text style={styles.error}>No se pudo cargar la información.</Text>}

      {data?.phase === 'upcoming' && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>Predicciones de la peña</Text>
          <Text variant="bodySmall" style={styles.hint}>Las predicciones se revelan cuando empiece el partido.</Text>
          <Divider style={styles.divider} />
          {data.members.map(({ user: u, hasPredicted, revealedPrediction }) => (
            <View key={u.id} style={styles.memberRow}>
              <Avatar.Text size={32} label={u.alias.slice(0, 2).toUpperCase()} style={styles.memberAvatar} />
              <Text
                variant="bodyMedium"
                style={[styles.memberAlias, u.id === user?.id && { color: theme.colors.primary, fontWeight: '700' }]}
              >
                {u.alias}{u.id === user?.id ? ' (tú)' : ''}
              </Text>
              {revealedPrediction ? (
                <Text variant="labelSmall" style={styles.revealedBadge}>
                  🎙️ {revealedPrediction.predictedHome}-{revealedPrediction.predictedAway}
                </Text>
              ) : hasPredicted ? (
                <Text variant="labelSmall" style={styles.predictedBadge}>✓ Predicho</Text>
              ) : (
                <Text variant="labelSmall" style={styles.pendingBadge}>Pendiente</Text>
              )}
            </View>
          ))}
        </>
      )}

      {(data?.phase === 'live' || data?.phase === 'finished') && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            {data.phase === 'live' ? 'Predicciones (partido en juego)' : 'Predicciones finales'}
          </Text>

          {data.groups.map((g) => {
            const isFinished = data.phase === 'finished';
            return (
              <Surface key={`${g.predictedHome}-${g.predictedAway}`} style={styles.predGroup} elevation={1}>
                <Text variant="titleLarge" style={styles.predScore}>
                  {g.predictedHome} - {g.predictedAway}
                </Text>
                <View style={styles.usersRow}>
                  {g.users.map((u) => (
                    <UserChip
                      key={u.id}
                      alias={u.alias}
                      isMe={u.id === user?.id}
                      points={isFinished && 'points' in u ? (u as typeof u & { points: number | null }).points : undefined}
                      cards={cardsByUser.get(u.id)}
                    />
                  ))}
                </View>
              </Surface>
            );
          })}

          {data.noPrediction.length > 0 && (
            <>
              <Divider style={styles.divider} />
              <Text variant="labelMedium" style={styles.noPredLabel}>Sin predicción</Text>
              <View style={styles.usersRow}>
                {data.noPrediction.map((u) => (
                  <UserChip key={u.id} alias={u.alias} isMe={u.id === user?.id} cards={cardsByUser.get(u.id)} />
                ))}
              </View>
            </>
          )}

          {matchCardPlays.length > 0 && (
            <>
              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={styles.sectionTitle}>Cartas jugadas</Text>
              {matchCardPlays.map((play) => (
                <CardPlayRow key={play._id} play={play} myId={user?.id ?? ''} />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  matchHeader: { borderRadius: 10, padding: 16, gap: 8 },
  date: { textAlign: 'center', opacity: 0.5, textTransform: 'capitalize' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { flex: 1, fontWeight: '600' },
  score: { fontWeight: '700', minWidth: 60, textAlign: 'center' },
  vsText: { opacity: 0.4, minWidth: 32, textAlign: 'center' },
  sectionTitle: { fontWeight: '700', marginTop: 4 },
  hint: { opacity: 0.5 },
  divider: { marginVertical: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  memberAvatar: { backgroundColor: '#90A4AE' },
  memberAlias: { flex: 1 },
  revealedBadge: { color: '#7C3AED', fontWeight: '700' },
  predictedBadge: { color: '#1E6B45', fontWeight: '700' },
  pendingBadge: { opacity: 0.4 },
  predGroup: { borderRadius: 10, padding: 14, gap: 10 },
  predScore: { fontWeight: '700' },
  usersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  userChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipAvatar: { backgroundColor: '#90A4AE' },
  chipCardEmojis: { fontSize: 13, lineHeight: 18 },
  userPts: { color: '#1E6B45', fontWeight: '700' },
  userPtsZero: { color: '#9C3B2C' },
  noPredLabel: { opacity: 0.5 },
  error: { color: '#9C3B2C', textAlign: 'center', marginTop: 32 },
  cardPlayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  cardPlayEmoji: { fontSize: 22, lineHeight: 28 },
});
