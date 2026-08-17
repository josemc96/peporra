import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { predictionsApi } from '@/api/predictions';
import { ApiError } from '@/api/client';
import { colors } from '@/config/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
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
