import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { predictionsApi } from '@/api/predictions';
import { standingsTableApi, MatchResult, MatchResultDetail } from '@/api/standingsTable';
import { ApiError } from '@/api/client';
import { colors } from '@/config/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

const RESULT_COLOR: Record<MatchResult, string> = {
  W: colors.green,
  L: colors.error,
  D: colors.text2,
};

function Last5Dots({ results, expanded, onToggle }: { results: MatchResult[]; expanded: boolean; onToggle: () => void }) {
  if (results.length === 0) return null;
  return (
    <Pressable onPress={onToggle} hitSlop={8}>
      <View style={[styles.last5Row, expanded && styles.last5RowActive]}>
        {results.map((r, i) => (
          <View key={i} style={[styles.last5Dot, { backgroundColor: RESULT_COLOR[r] }]} />
        ))}
        <Icon source={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text2} />
      </View>
    </Pressable>
  );
}

function Last5Panel({ teamName, detail }: { teamName: string; detail: MatchResultDetail[] }) {
  if (detail.length === 0) return null;
  return (
    <View style={styles.last5Panel}>
      <Text variant="labelMedium" style={styles.last5PanelTitle}>Últimos 5 · {teamName}</Text>
      {detail.map((m, i) => (
        <View key={i} style={styles.last5PanelRow}>
          <View style={[styles.last5PanelDot, { backgroundColor: RESULT_COLOR[m.result] }]} />
          {m.opponentCrest ? <Image source={{ uri: m.opponentCrest }} style={styles.last5PanelCrest} /> : null}
          <Text variant="bodySmall" style={styles.last5PanelOpponent} numberOfLines={1}>
            {m.isHome ? 'vs' : '@'} {m.opponent}
          </Text>
          <Text variant="bodySmall" style={styles.last5PanelScore}>{m.goalsFor}-{m.goalsAgainst}</Text>
          <Text variant="labelSmall" style={styles.last5PanelDate}>{formatShortDate(m.startTime)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function EditPredictionScreen() {
  const { matchId, season, groupId, homeTeam, awayTeam, startTime, currentHome, currentAway, homeCrest, awayCrest } =
    useLocalSearchParams<{
      matchId: string;
      season: string;
      groupId: string;
      homeTeam: string;
      awayTeam: string;
      startTime: string;
      currentHome: string;
      currentAway: string;
      homeCrest?: string;
      awayCrest?: string;
    }>();

  const queryClient = useQueryClient();
  const [homeScore, setHomeScore] = useState(currentHome ?? '');
  const [awayScore, setAwayScore] = useState(currentAway ?? '');
  const [error, setError] = useState('');
  const [expandedTeam, setExpandedTeam] = useState<'home' | 'away' | null>(null);

  const { data: otherGroups } = useQuery({
    queryKey: ['predictions-across-groups', matchId],
    queryFn: () => predictionsApi.acrossGroups(matchId),
    select: (groups) => groups.filter((g) => g.groupId !== groupId && g.prediction !== null),
  });

  const { data: table } = useQuery({
    queryKey: ['standings-table', season],
    queryFn: () => standingsTableApi.getCurrent(season),
    enabled: !!season,
    staleTime: 5 * 60 * 1000,
  });

  const rowByTeam = new Map(table?.map((row) => [row.team, row]));
  const homePosition = rowByTeam.get(homeTeam)?.position;
  const awayPosition = rowByTeam.get(awayTeam)?.position;
  const homeLast5 = rowByTeam.get(homeTeam)?.last5 ?? [];
  const awayLast5 = rowByTeam.get(awayTeam)?.last5 ?? [];
  const homeLast5Detail = rowByTeam.get(homeTeam)?.last5Detail ?? [];
  const awayLast5Detail = rowByTeam.get(awayTeam)?.last5Detail ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const home = parseInt(homeScore, 10);
      const away = parseInt(awayScore, 10);
      return predictionsApi.upsert(matchId, groupId, home, away);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions', season, groupId] });
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Error al guardar la predicción');
    },
  });

  const homeVal = parseInt(homeScore, 10);
  const awayVal = parseInt(awayScore, 10);
  const isValid =
    homeScore !== '' &&
    awayScore !== '' &&
    Number.isInteger(homeVal) &&
    Number.isInteger(awayVal) &&
    homeVal >= 0 &&
    awayVal >= 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text variant="labelMedium" style={styles.date}>{formatDate(startTime)}</Text>

        {/* Equipos y marcador */}
        <View style={styles.scoreRow}>
          <View style={styles.teamBlock}>
            {homeCrest ? <Image source={{ uri: homeCrest }} style={styles.crest} /> : null}
            <Text variant="titleMedium" style={styles.teamName} numberOfLines={2}>
              {homeTeam}
            </Text>
            {homePosition != null && (
              <View style={styles.teamPositionBadge}>
                <Text variant="labelMedium" style={styles.teamPositionText}>{homePosition}º</Text>
              </View>
            )}
            <Last5Dots
              results={homeLast5}
              expanded={expandedTeam === 'home'}
              onToggle={() => setExpandedTeam(expandedTeam === 'home' ? null : 'home')}
            />
          </View>

          <View style={styles.scoreInputs}>
            <TextInput
              value={homeScore}
              onChangeText={(v) => { setHomeScore(v); setError(''); }}
              keyboardType="numeric"
              maxLength={2}
              style={styles.scoreInput}
              mode="outlined"
              textAlign="center"
              autoFocus
            />
            <Text variant="headlineMedium" style={styles.dash}>-</Text>
            <TextInput
              value={awayScore}
              onChangeText={(v) => { setAwayScore(v); setError(''); }}
              keyboardType="numeric"
              maxLength={2}
              style={styles.scoreInput}
              mode="outlined"
              textAlign="center"
            />
          </View>

          <View style={[styles.teamBlock, styles.teamRight]}>
            {awayCrest ? <Image source={{ uri: awayCrest }} style={styles.crest} /> : null}
            <Text variant="titleMedium" style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={2}>
              {awayTeam}
            </Text>
            {awayPosition != null && (
              <View style={styles.teamPositionBadge}>
                <Text variant="labelMedium" style={styles.teamPositionText}>{awayPosition}º</Text>
              </View>
            )}
            <Last5Dots
              results={awayLast5}
              expanded={expandedTeam === 'away'}
              onToggle={() => setExpandedTeam(expandedTeam === 'away' ? null : 'away')}
            />
          </View>
        </View>

        {expandedTeam === 'home' && <Last5Panel teamName={homeTeam} detail={homeLast5Detail} />}
        {expandedTeam === 'away' && <Last5Panel teamName={awayTeam} detail={awayLast5Detail} />}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {otherGroups && otherGroups.length > 0 && (
          <View style={styles.otherGroups}>
            <Text variant="labelSmall" style={styles.otherGroupsTitle}>
              Tu predicción en otras peñas (pulsa para copiar)
            </Text>
            {otherGroups.map((g) => (
              <Pressable
                key={g.groupId}
                style={styles.otherGroupRow}
                onPress={() => {
                  setHomeScore(String(g.prediction!.predictedHome));
                  setAwayScore(String(g.prediction!.predictedAway));
                  setError('');
                }}
              >
                <Text variant="bodySmall" style={styles.otherGroupName}>{g.groupName}</Text>
                <Text variant="bodySmall" style={styles.otherGroupScore}>
                  {g.prediction!.predictedHome} - {g.prediction!.predictedAway}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.button}>
            Cancelar
          </Button>
          <Button
            mode="contained"
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={mutation.isPending || !isValid}
            style={styles.button}
          >
            Guardar
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  date: {
    textAlign: 'center',
    opacity: 0.6,
    textTransform: 'capitalize',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  teamRight: {
    alignItems: 'flex-end',
  },
  crest: {
    width: 36,
    height: 36,
  },
  teamName: {
    fontWeight: '600',
    textAlign: 'center',
  },
  teamPositionBadge: {
    backgroundColor: colors.goldDim,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  teamPositionText: {
    color: colors.gold,
    fontWeight: '700',
  },
  last5Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 8,
  },
  last5RowActive: {
    backgroundColor: '#1A1F35',
  },
  last5Dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  last5Panel: {
    gap: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#1A1F35',
  },
  last5PanelTitle: {
    opacity: 0.6,
    marginBottom: 2,
  },
  last5PanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  last5PanelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  last5PanelCrest: {
    width: 18,
    height: 18,
  },
  last5PanelOpponent: {
    flex: 1,
    opacity: 0.85,
  },
  last5PanelScore: {
    fontWeight: '700',
  },
  last5PanelDate: {
    opacity: 0.5,
    width: 48,
    textAlign: 'right',
  },
  scoreInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreInput: {
    width: 56,
    fontSize: 24,
  },
  dash: {
    opacity: 0.4,
  },
  error: {
    color: '#FF4D6D',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
  otherGroups: {
    gap: 6,
  },
  otherGroupsTitle: {
    opacity: 0.5,
    marginBottom: 2,
  },
  otherGroupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1A1F35',
  },
  otherGroupName: {
    opacity: 0.8,
  },
  otherGroupScore: {
    fontWeight: '600',
    color: colors.primary,
  },
});
