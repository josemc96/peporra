import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, IconButton, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { predictionsApi, Match, Prediction } from '@/api/predictions';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function MatchCard({
  match,
  prediction,
  season,
}: {
  match: Match;
  prediction: Prediction | undefined;
  season: string;
}) {
  const isLocked = new Date() >= new Date(match.startTime);
  const hasPrediction = prediction !== undefined;

  function openEditor() {
    router.push({
      pathname: '/predictions/edit/[matchId]',
      params: {
        matchId: match._id,
        season,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        startTime: match.startTime,
        currentHome: hasPrediction ? String(prediction.predictedHome) : '',
        currentAway: hasPrediction ? String(prediction.predictedAway) : '',
      },
    });
  }

  return (
    <Card style={styles.matchCard} onPress={isLocked ? undefined : openEditor}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.teamsRow}>
          <Text variant="titleSmall" style={styles.team} numberOfLines={1}>
            {match.homeTeam}
          </Text>
          <Text variant="labelMedium" style={styles.vs}>vs</Text>
          <Text variant="titleSmall" style={[styles.team, styles.teamRight]} numberOfLines={1}>
            {match.awayTeam}
          </Text>
        </View>

        <Text variant="labelSmall" style={styles.dateText}>
          {formatDateTime(match.startTime)}
        </Text>

        {match.status === 'finished' && (
          <Text variant="labelMedium" style={styles.result}>
            Resultado: {match.homeScore} - {match.awayScore}
          </Text>
        )}

        <View style={styles.predictionRow}>
          {hasPrediction ? (
            <Text variant="bodySmall" style={styles.predictionText}>
              Tu predicción: {prediction.predictedHome} - {prediction.predictedAway}
            </Text>
          ) : (
            <Text variant="bodySmall" style={styles.noPrediction}>
              {isLocked ? 'No predijiste' : 'Sin predecir'}
            </Text>
          )}

          {!isLocked && (
            <Button mode="text" compact onPress={openEditor}>
              {hasPrediction ? 'Editar' : 'Predecir'}
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

export default function PredictionsScreen() {
  const { season } = useLocalSearchParams<{ season: string }>();
  const [selectedMatchday, setSelectedMatchday] = useState<number>(1);

  const { data: matches, isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
  });

  const { data: predictions, isLoading: loadingPredictions } = useQuery({
    queryKey: ['predictions', season],
    queryFn: () => predictionsApi.listMyPredictions(season),
  });

  const matchdays = useMemo(() => {
    if (!matches) return [];
    const days = [
      ...new Set(
        matches
          .filter((m) => m.competition === 'la_liga' && m.matchday != null)
          .map((m) => m.matchday!)
      ),
    ].sort((a, b) => a - b);
    return days;
  }, [matches]);

  // Inicializa en la primera jornada con partidos pendientes
  useEffect(() => {
    if (!matches || matchdays.length === 0) return;
    const now = new Date();
    const firstPending = matchdays.find((day) =>
      matches.some((m) => m.matchday === day && new Date(m.startTime) > now)
    );
    setSelectedMatchday(firstPending ?? matchdays[matchdays.length - 1]);
  }, [matches, matchdays]);

  const predictionMap = useMemo(() => {
    const map = new Map<string, Prediction>();
    predictions?.forEach((p) => map.set(p.match._id, p));
    return map;
  }, [predictions]);

  const filteredMatches = useMemo(
    () => matches?.filter((m) => m.competition === 'la_liga' && m.matchday === selectedMatchday) ?? [],
    [matches, selectedMatchday]
  );

  const isLoading = loadingMatches || loadingPredictions;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const currentIdx = matchdays.indexOf(selectedMatchday);

  return (
    <View style={styles.container}>
      {/* Navegación de jornada */}
      <View style={styles.matchdayNav}>
        <IconButton
          icon="chevron-left"
          size={28}
          onPress={() => setSelectedMatchday(matchdays[currentIdx - 1])}
          disabled={currentIdx <= 0}
        />
        <Text variant="titleMedium" style={styles.matchdayLabel}>
          Jornada {selectedMatchday}
          <Text variant="bodySmall" style={styles.matchdayTotal}> / {matchdays.length}</Text>
        </Text>
        <IconButton
          icon="chevron-right"
          size={28}
          onPress={() => setSelectedMatchday(matchdays[currentIdx + 1])}
          disabled={currentIdx >= matchdays.length - 1}
        />
      </View>

      {/* Lista de partidos */}
      <FlatList
        data={filteredMatches}
        keyExtractor={(m) => m._id}
        renderItem={({ item }) => (
          <MatchCard
            match={item}
            prediction={predictionMap.get(item._id)}
            season={season}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchdayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  matchdayLabel: {
    fontWeight: '600',
  },
  matchdayTotal: {
    opacity: 0.4,
    fontWeight: 'normal',
  },
  list: {
    padding: 12,
    gap: 10,
    paddingBottom: 32,
  },
  matchCard: {
    width: '100%',
  },
  cardContent: {
    gap: 4,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  team: {
    flex: 1,
  },
  teamRight: {
    textAlign: 'right',
  },
  vs: {
    opacity: 0.5,
  },
  dateText: {
    opacity: 0.5,
    marginTop: 2,
  },
  result: {
    marginTop: 4,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  predictionText: {
    color: '#1E6B45',
    fontWeight: '600',
  },
  noPrediction: {
    opacity: 0.4,
    fontStyle: 'italic',
  },
});
