import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { predictionsApi } from '@/api/predictions';
import { standingsTableApi, MatchResult } from '@/api/standingsTable';
import { ApiError } from '@/api/client';
import { colors } from '@/config/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

const RESULT_COLOR: Record<MatchResult, string> = {
  W: colors.green,
  L: colors.error,
  D: colors.text2,
};

function Last5Dots({ results }: { results: MatchResult[] }) {
  if (results.length === 0) return null;
  return (
    <View style={styles.last5Row}>
      {results.map((r, i) => (
        <View key={i} style={[styles.last5Dot, { backgroundColor: RESULT_COLOR[r] }]} />
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
            <Last5Dots results={homeLast5} />
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
            <Last5Dots results={awayLast5} />
          </View>
        </View>

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
    gap: 4,
  },
  last5Dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
