import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Chip, Divider, Surface, Text, useTheme } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { matchVisibilityApi } from '@/api/matchVisibility';
import { useAuth } from '@/context/AuthContext';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function UserChip({ alias, isMe }: { alias: string; isMe: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.userChip, isMe && { borderColor: theme.colors.primary, borderWidth: 1.5 }]}>
      <Avatar.Text size={20} label={alias.slice(0, 2).toUpperCase()} style={styles.chipAvatar} />
      <Text variant="labelMedium" style={isMe ? { color: theme.colors.primary, fontWeight: '700' } : undefined}>
        {alias}{isMe ? ' (tú)' : ''}
      </Text>
    </View>
  );
}

export default function MatchPredictionViewScreen() {
  const { matchId, groupId, homeTeam, awayTeam, startTime, homeScore, awayScore } =
    useLocalSearchParams<{
      matchId: string;
      groupId: string;
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
          {data.members.map(({ user: u, hasPredicted }) => (
            <View key={u.id} style={styles.memberRow}>
              <Avatar.Text size={32} label={u.alias.slice(0, 2).toUpperCase()} style={styles.memberAvatar} />
              <Text
                variant="bodyMedium"
                style={[styles.memberAlias, u.id === user?.id && { color: theme.colors.primary, fontWeight: '700' }]}
              >
                {u.alias}{u.id === user?.id ? ' (tú)' : ''}
              </Text>
              {hasPredicted ? (
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
            const pts = isFinished ? (g as typeof data.groups[0] & { points: number }).points : null;
            return (
              <Surface key={`${g.predictedHome}-${g.predictedAway}`} style={styles.predGroup} elevation={1}>
                <View style={styles.predGroupHeader}>
                  <Text variant="titleLarge" style={styles.predScore}>
                    {g.predictedHome} - {g.predictedAway}
                  </Text>
                  {pts != null && (
                    <Chip compact style={styles.ptsChip}>
                      {pts} pts
                    </Chip>
                  )}
                </View>
                <View style={styles.usersRow}>
                  {g.users.map((u) => (
                    <UserChip key={u.id} alias={u.alias} isMe={u.id === user?.id} />
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
                  <UserChip key={u.id} alias={u.alias} isMe={u.id === user?.id} />
                ))}
              </View>
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
  predictedBadge: { color: '#1E6B45', fontWeight: '700' },
  pendingBadge: { opacity: 0.4 },
  predGroup: { borderRadius: 10, padding: 14, gap: 10 },
  predGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  predScore: { fontWeight: '700' },
  ptsChip: { backgroundColor: '#D1FAE5' },
  usersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  userChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipAvatar: { backgroundColor: '#90A4AE' },
  noPredLabel: { opacity: 0.5 },
  error: { color: '#9C3B2C', textAlign: 'center', marginTop: 32 },
});
