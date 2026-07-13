import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView } from 'react-native';

import { qualifierPredictionsApi, Qualifier } from '@/api/qualifierPredictions';
import { predictionsApi, Match, Prediction } from '@/api/predictions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function competitionLabel(competition: string): string {
  if (competition === 'copa_del_rey') return 'Copa del Rey';
  if (competition === 'supercopa') return 'Supercopa de España';
  return competition;
}

interface MatchCardProps {
  match: Match;
  prediction: Prediction | undefined;
  qualifierPrediction: string | undefined;
  season: string;
  locked: boolean;
}

function MatchCard({ match, prediction, qualifierPrediction, season, locked }: MatchCardProps) {
  const theme = useTheme();
  const qc = useQueryClient();

  const { mutate: saveQualifier, isPending } = useMutation({
    mutationFn: (q: Qualifier) => qualifierPredictionsApi.upsert(match._id, q),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qualifier-predictions'] }),
  });

  const scoreLabel = prediction
    ? `${prediction.predictedHome} - ${prediction.predictedAway}`
    : 'Sin predicción';

  return (
    <Surface style={styles.card} elevation={2}>
      <Text variant="labelSmall" style={styles.competition}>
        {competitionLabel(match.competition)}
      </Text>
      <Text variant="labelSmall" style={styles.date}>{formatDate(match.startTime)}</Text>

      {/* Teams + score */}
      <View style={styles.teamsRow}>
        <Text variant="titleMedium" style={styles.team} numberOfLines={2}>{match.homeTeam}</Text>
        <Text variant="titleLarge" style={styles.score}>{scoreLabel}</Text>
        <Text variant="titleMedium" style={[styles.team, { textAlign: 'right' }]} numberOfLines={2}>
          {match.awayTeam}
        </Text>
      </View>

      {!locked && (
        <Button
          mode="text"
          compact
          icon="pencil"
          onPress={() =>
            router.push({
              pathname: '/predictions/edit/[matchId]',
              params: {
                matchId: match._id,
                season,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                startTime: match.startTime,
                currentHome: prediction?.predictedHome?.toString() ?? '',
                currentAway: prediction?.predictedAway?.toString() ?? '',
              },
            })
          }
        >
          {prediction ? 'Editar resultado' : 'Predecir resultado'}
        </Button>
      )}

      <Divider style={styles.divider} />

      {/* Qualifier prediction */}
      <Text variant="labelMedium" style={styles.qualifierLabel}>
        ¿Quién se clasifica?
      </Text>
      <Text variant="labelSmall" style={styles.qualifierNote}>
        Solo puntúa si el partido acaba en empate a los 90'
      </Text>
      <View style={styles.qualifierRow}>
        <Chip
          selected={qualifierPrediction === 'home'}
          onPress={locked ? undefined : () => saveQualifier('home')}
          disabled={isPending}
          style={styles.qualifierChip}
        >
          {match.homeTeam}
        </Chip>
        <Chip
          selected={qualifierPrediction === 'away'}
          onPress={locked ? undefined : () => saveQualifier('away')}
          disabled={isPending}
          style={styles.qualifierChip}
        >
          {match.awayTeam}
        </Chip>
      </View>
    </Surface>
  );
}

export default function KnockoutScreen() {
  const { season } = useLocalSearchParams<{ season: string }>();

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['knockout-matches', season],
    queryFn: () => qualifierPredictionsApi.listKnockoutMatches(season),
  });

  const { data: predictions, isLoading: predLoading } = useQuery({
    queryKey: ['predictions', season],
    queryFn: () => predictionsApi.listMyPredictions(season),
    enabled: !!matches && matches.length > 0,
  });

  const { data: qualifiers, isLoading: qualLoading } = useQuery({
    queryKey: ['qualifier-predictions'],
    queryFn: qualifierPredictionsApi.listMine,
    enabled: !!matches && matches.length > 0,
  });

  const isLoading = matchesLoading || predLoading || qualLoading;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text variant="titleMedium" style={styles.emptyTitle}>Sin partidos de copa</Text>
        <Text style={styles.emptyText}>
          El admin aún no ha dado de alta ningún partido de Copa del Rey o Supercopa para esta temporada.
        </Text>
      </View>
    );
  }

  const now = new Date();

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {matches.map((match) => {
        const pred = predictions?.find((p) => {
          const m = p.match as Match;
          return (typeof m === 'string' ? m : m._id) === match._id;
        });
        const qual = qualifiers?.find((q) => {
          const m = q.match as Match;
          return (typeof m === 'string' ? m : m._id) === match._id;
        });
        const locked = now >= new Date(match.startTime);

        return (
          <MatchCard
            key={match._id}
            match={match}
            prediction={pred}
            qualifierPrediction={qual?.predictedQualifier}
            season={season}
            locked={locked}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', opacity: 0.6 },
  list: { padding: 16, gap: 16, paddingBottom: 32 },
  card: { borderRadius: 12, padding: 16, gap: 8 },
  competition: { opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1 },
  date: { opacity: 0.6, textTransform: 'capitalize' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  team: { flex: 1, fontWeight: '600' },
  score: { fontWeight: 'bold', minWidth: 80, textAlign: 'center' },
  divider: { marginVertical: 4 },
  qualifierLabel: { fontWeight: '600' },
  qualifierNote: { opacity: 0.5, marginBottom: 4 },
  qualifierRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  qualifierChip: { flex: 1 },
});
