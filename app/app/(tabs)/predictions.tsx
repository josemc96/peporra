import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Button, Card, Chip, IconButton,
  SegmentedButtons, Text,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { predictionsApi, Match, Prediction } from '@/api/predictions';
import { adminGroupApi, ScoreMultiplier } from '@/api/adminGroup';
import { cardsApi, CARD_LABELS, CARD_EMOJI } from '@/api/cards';
import { useCurrentGroup } from '@/context/CurrentGroupContext';
import { colors } from '@/config/theme';

type Competition = 'la_liga' | 'copa_del_rey' | 'supercopa';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function resolveMultiplier(match: Match, multipliers: ScoreMultiplier[]): number | null {
  const matchMult = multipliers.find((m) => m.scope === 'match' && m.match === match._id);
  if (matchMult) return matchMult.multiplier;
  if (match.matchday != null) {
    const dayMult = multipliers.find((m) => m.scope === 'matchday' && m.matchday === match.matchday);
    if (dayMult) return dayMult.multiplier;
  }
  return null;
}

function MatchCard({ match, prediction, season, groupId, multiplier }: {
  match: Match; prediction: Prediction | undefined;
  season: string; groupId: string; multiplier: number | null;
}) {
  const isLocked = new Date() >= new Date(match.startTime);
  const hasPrediction = prediction !== undefined;

  function openEditor() {
    router.push({
      pathname: '/predictions/edit/[matchId]',
      params: {
        matchId: match._id, season,
        homeTeam: match.homeTeam, awayTeam: match.awayTeam, startTime: match.startTime,
        currentHome: hasPrediction ? String(prediction.predictedHome) : '',
        currentAway: hasPrediction ? String(prediction.predictedAway) : '',
      },
    });
  }

  function openView() {
    router.push({ pathname: '/predictions/view/[matchId]' as never, params: {
      matchId: match._id, groupId, season,
      matchday: match.matchday != null ? String(match.matchday) : undefined,
      homeTeam: match.homeTeam, awayTeam: match.awayTeam, startTime: match.startTime,
      homeScore: match.homeScore != null ? String(match.homeScore) : undefined,
      awayScore: match.awayScore != null ? String(match.awayScore) : undefined,
    }});
  }

  return (
    <Card style={styles.matchCard} onPress={isLocked ? openView : openEditor}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.teamsRow}>
          <Text variant="titleSmall" style={styles.team} numberOfLines={1}>{match.homeTeam}</Text>
          {match.status === 'finished' ? (
            <Text variant="titleMedium" style={styles.scoreCenter}>{match.homeScore} - {match.awayScore}</Text>
          ) : isLocked ? (
            <Text variant="labelSmall" style={styles.liveIndicator}>● EN CURSO</Text>
          ) : hasPrediction ? (
            <Text variant="titleMedium" style={styles.predCenter}>
              {prediction.predictedHome} - {prediction.predictedAway}
            </Text>
          ) : (
            <Text variant="labelMedium" style={styles.vs}>vs</Text>
          )}
          <Text variant="titleSmall" style={[styles.team, styles.teamRight]} numberOfLines={1}>{match.awayTeam}</Text>
          {multiplier != null && (
            <Chip compact style={styles.multChip} textStyle={styles.multText}>×{multiplier}</Chip>
          )}
        </View>
        <Text variant="labelSmall" style={styles.dateText}>{formatDateTime(match.startTime)}</Text>
        <View style={styles.predictionRow}>
          {!isLocked ? (
            <Button mode="text" compact onPress={openEditor} style={styles.predBtn}>
              {hasPrediction ? 'Editar' : 'Predecir'}
            </Button>
          ) : hasPrediction ? (
            <Text variant="bodySmall" style={styles.predictionText}>
              Tu predicción: {prediction.predictedHome} - {prediction.predictedAway}
            </Text>
          ) : (
            <Text variant="bodySmall" style={styles.noPrediction}>No predijiste</Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

export default function PredictionsTab() {
  const { group } = useCurrentGroup();
  const groupId = group?.id ?? '';
  const season = group?.season ?? '';
  const [selectedMatchday, setSelectedMatchday] = useState<number>(1);
  const [competitionTab, setCompetitionTab] = useState<Competition>('la_liga');

  const { data: matches, isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
    enabled: !!season,
  });

  const { data: predictions, isLoading: loadingPredictions } = useQuery({
    queryKey: ['predictions', season],
    queryFn: () => predictionsApi.listMyPredictions(season),
    enabled: !!season,
  });

  const { data: multipliers } = useQuery({
    queryKey: ['multipliers', groupId, season],
    queryFn: () => adminGroupApi.listMultipliers(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: myDeal } = useQuery({
    queryKey: ['my-deal', groupId, season, selectedMatchday],
    queryFn: () => cardsApi.getMyDeal(groupId, season, selectedMatchday),
    enabled: !!groupId && selectedMatchday > 0 && competitionTab === 'la_liga',
  });

  const enabledCompetitions = settings?.enabledCompetitions ?? [];
  const hasCopaEnabled = enabledCompetitions.includes('copa_del_rey');
  const hasSupercopaEnabled = enabledCompetitions.includes('supercopa');

  // Si el tab activo deja de estar habilitado, volver a La Liga
  useEffect(() => {
    if (competitionTab === 'copa_del_rey' && !hasCopaEnabled) setCompetitionTab('la_liga');
    if (competitionTab === 'supercopa' && !hasSupercopaEnabled) setCompetitionTab('la_liga');
  }, [hasCopaEnabled, hasSupercopaEnabled, competitionTab]);

  const competitionTabs = useMemo(() => {
    const tabs: { value: string; label: string }[] = [{ value: 'la_liga', label: 'La Liga' }];
    if (hasCopaEnabled) tabs.push({ value: 'copa_del_rey', label: 'Copa del Rey' });
    if (hasSupercopaEnabled) tabs.push({ value: 'supercopa', label: 'Supercopa' });
    return tabs;
  }, [hasCopaEnabled, hasSupercopaEnabled]);

  const matchdays = useMemo(() => {
    if (!matches) return [];
    return [
      ...new Set(
        matches
          .filter((m) => m.competition === 'la_liga' && m.matchday != null)
          .map((m) => m.matchday!)
      ),
    ].sort((a, b) => a - b);
  }, [matches]);

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

  const filteredMatches = useMemo(() => {
    if (!matches) return [];
    if (competitionTab === 'la_liga') {
      return matches.filter((m) => m.competition === 'la_liga' && m.matchday === selectedMatchday);
    }
    return matches.filter((m) => m.competition === competitionTab);
  }, [matches, competitionTab, selectedMatchday]);

  const isLoading = loadingMatches || loadingPredictions;
  const currentIdx = matchdays.indexOf(selectedMatchday);

  if (!group) return null;

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Tabs de competición (solo si hay más de una habilitada) */}
      {competitionTabs.length > 1 && (
        <View style={styles.competitionTabsWrapper}>
          <SegmentedButtons
            value={competitionTab}
            onValueChange={(v) => setCompetitionTab(v as Competition)}
            buttons={competitionTabs}
          />
        </View>
      )}

      {/* Selector de jornada (solo La Liga) */}
      {competitionTab === 'la_liga' && (
        <View style={styles.matchdayNav}>
          <IconButton
            icon="chevron-left" size={28}
            onPress={() => setSelectedMatchday(matchdays[currentIdx - 1])}
            disabled={currentIdx <= 0}
          />
          <Text variant="titleMedium" style={styles.matchdayLabel}>
            Jornada {selectedMatchday}
            <Text variant="bodySmall" style={styles.matchdayTotal}> / {matchdays.length}</Text>
          </Text>
          <IconButton
            icon="chevron-right" size={28}
            onPress={() => setSelectedMatchday(matchdays[currentIdx + 1])}
            disabled={currentIdx >= matchdays.length - 1}
          />
        </View>
      )}

      {/* Banner carta de jornada (solo La Liga) */}
      {competitionTab === 'la_liga' && groupId && myDeal?.deal && myDeal.deal.status !== 'expired' && (
        <Button
          mode={myDeal.deal.status === 'pending' || myDeal.deal.status === 'locked' ? 'contained-tonal' : 'text'}
          compact icon={myDeal.deal.status === 'locked' ? 'lock' : 'cards-playing'}
          onPress={() => router.push({
            pathname: '/cards/[groupId]' as never,
            params: { groupId, season, matchday: String(selectedMatchday) },
          })}
          style={styles.cardBanner}
        >
          {myDeal.deal.status === 'locked'
            ? '🔒 Carta bloqueada · Desbloquear'
            : `${CARD_EMOJI[myDeal.deal.card]} ${CARD_LABELS[myDeal.deal.card]}${myDeal.deal.status === 'pending' ? ' · Jugar' : ' · Jugada'}`
          }
        </Button>
      )}

      <FlatList
        data={filteredMatches}
        keyExtractor={(m) => m._id}
        renderItem={({ item }) => (
          <MatchCard
            match={item}
            prediction={predictionMap.get(item._id)}
            season={season}
            groupId={groupId}
            multiplier={multipliers ? resolveMultiplier(item, multipliers) : null}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {competitionTab === 'la_liga'
              ? 'No hay partidos para esta jornada.'
              : 'No hay partidos de esta competición todavía.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  competitionTabsWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },

  matchdayNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1F2540',
  },
  matchdayLabel: { fontWeight: '600' },
  matchdayTotal: { opacity: 0.4, fontWeight: 'normal' },
  cardBanner: { marginHorizontal: 8, marginVertical: 4 },
  list: { padding: 12, gap: 10, paddingBottom: 32 },
  emptyText: { textAlign: 'center', opacity: 0.5, marginTop: 40, fontStyle: 'italic' },
  matchCard: { width: '100%' },
  cardContent: { gap: 4 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { flex: 1 },
  teamRight: { textAlign: 'right' },
  vs: { opacity: 0.5 },
  scoreCenter: { fontWeight: '700', minWidth: 48, textAlign: 'center' },
  predCenter: { fontWeight: '600', minWidth: 48, textAlign: 'center', opacity: 0.75 },
  liveIndicator: { color: '#8892A4', fontWeight: '700', minWidth: 64, textAlign: 'center' },
  predBtn: { marginLeft: -8 },
  multChip: { backgroundColor: '#FFBE0B', height: 24 },
  multText: { color: '#000000', fontWeight: '700', fontSize: 12 },
  dateText: { opacity: 0.5, marginTop: 2 },
  predictionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  predictionText: { color: '#22C55E', fontWeight: '600' },
  noPrediction: { opacity: 0.4, fontStyle: 'italic' },
});
