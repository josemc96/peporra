import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Button, Card, Chip,
  Modal, Portal, SegmentedButtons, Text,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { predictionsApi, Match, Prediction } from '@/api/predictions';
import { adminGroupApi, ScoreMultiplier } from '@/api/adminGroup';
import { cardsApi, CARD_LABELS, CARD_EMOJI } from '@/api/cards';
import { useCurrentGroup } from '@/context/CurrentGroupContext';
import { colors } from '@/config/theme';

type Competition = 'la_liga' | 'copa_del_rey' | 'supercopa';

interface MatchdaySection {
  title: string;
  matchday: number;
  data: Match[];
}

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

function MatchCard({ match, prediction, season, groupId, multiplier, missingPredictors, pressReveals, spyResults }: {
  match: Match; prediction: Prediction | undefined;
  season: string; groupId: string; multiplier: number | null;
  missingPredictors: { id: string; alias: string }[];
  pressReveals: { alias: string; predictedHome: number; predictedAway: number }[];
  spyResults: { alias: string; predictedHome: number; predictedAway: number }[];
}) {
  const [showMissing, setShowMissing] = useState(false);
  const [showSpy, setShowSpy] = useState(false);
  const isLocked = new Date() >= new Date(match.startTime);
  const hasPrediction = prediction !== undefined;
  const isFinished = match.status === 'finished';
  const isLive = isLocked && !isFinished;
  const hasLiveScore = match.homeScore != null && match.awayScore != null;

  function sign(h: number, a: number) { return h > a ? 1 : h < a ? -1 : 0; }
  const signOk = isFinished && hasPrediction && match.homeScore != null && match.awayScore != null
    ? sign(prediction.predictedHome, prediction.predictedAway) === sign(match.homeScore, match.awayScore)
    : null;
  const predTextColor = signOk === false ? '#EF4444' : '#22C55E';

  function openEditor() {
    router.push({
      pathname: '/predictions/edit/[matchId]',
      params: {
        matchId: match._id, season, groupId,
        homeTeam: match.homeTeam, awayTeam: match.awayTeam, startTime: match.startTime,
        currentHome: hasPrediction ? String(prediction.predictedHome) : '',
        currentAway: hasPrediction ? String(prediction.predictedAway) : '',
        homeCrest: match.homeCrest,
        awayCrest: match.awayCrest,
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
      homeCrest: match.homeCrest,
      awayCrest: match.awayCrest,
    }});
  }

  return (
    <Card style={styles.matchCard} onPress={isLocked ? openView : openEditor}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.teamsRow}>
          <View style={styles.teamCell}>
            {match.homeCrest ? <Image source={{ uri: match.homeCrest }} style={styles.crest} /> : null}
            <Text variant="titleSmall" style={styles.team} numberOfLines={1}>{match.homeTeam}</Text>
          </View>
          {isFinished ? (
            <Text variant="titleMedium" style={styles.scoreCenter}>{match.homeScore} - {match.awayScore}</Text>
          ) : isLive && hasLiveScore ? (
            <Text variant="titleMedium" style={[styles.scoreCenter, styles.liveScore]}>{match.homeScore} - {match.awayScore}</Text>
          ) : isLocked ? (
            <Text variant="labelSmall" style={styles.liveIndicator}>● EN CURSO</Text>
          ) : hasPrediction ? (
            <Text variant="titleMedium" style={styles.predCenter}>
              {prediction.predictedHome} - {prediction.predictedAway}
            </Text>
          ) : (
            <Text variant="labelMedium" style={styles.vs}>vs</Text>
          )}
          <View style={[styles.teamCell, styles.teamCellRight]}>
            <Text variant="titleSmall" style={[styles.team, styles.teamRight]} numberOfLines={1}>{match.awayTeam}</Text>
            {match.awayCrest ? <Image source={{ uri: match.awayCrest }} style={styles.crest} /> : null}
          </View>
          {multiplier != null && (
            <Chip compact style={styles.multChip} textStyle={styles.multText}>×{multiplier}</Chip>
          )}
        </View>
        <View style={styles.dateRow}>
          <Text variant="labelSmall" style={styles.dateText}>{formatDateTime(match.startTime)}</Text>
          {pressReveals.length > 0 && (
            <View style={styles.pressRevealCol}>
              {pressReveals.map((r, i) => (
                <Text key={i} variant="labelSmall" style={styles.pressRevealText}>
                  🎙️ {r.alias}: {r.predictedHome}-{r.predictedAway}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View style={styles.predictionRow}>
          <View style={styles.predictionRowLeft}>
            {!isLocked ? (
              hasPrediction ? (
                <Text variant="bodySmall" style={styles.predictionText}>
                  Tu predicción: {prediction.predictedHome} - {prediction.predictedAway}
                </Text>
              ) : (
                <Text variant="bodySmall" style={styles.noPrediction}>Toca para predecir</Text>
              )
            ) : hasPrediction ? (
              <Text variant="bodySmall" style={[styles.predictionText, { color: predTextColor }]}>
                Tu predicción: {prediction.predictedHome} - {prediction.predictedAway}
              </Text>
            ) : (
              <Text variant="bodySmall" style={styles.noPrediction}>No predijiste</Text>
            )}
          </View>

          <View style={styles.predictionRowRight}>
            {spyResults.length > 0 && (
              <Button
                mode="text" compact
                onPress={() => setShowSpy((v) => !v)}
                style={styles.spyBtn}
              >
                🕵️
              </Button>
            )}
            {!isLocked ? (
              missingPredictors.length > 0 && (
                <Button
                  mode="text" compact
                  icon={showMissing ? 'chevron-up' : 'account-group'}
                  onPress={() => setShowMissing((v) => !v)}
                  style={styles.whoMissingBtn}
                >
                  Quién falta
                </Button>
              )
            ) : (
              isLive && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text variant="labelSmall" style={styles.liveBadgeText}>EN CURSO</Text>
                </View>
              )
            )}
          </View>
        </View>
        {showMissing && missingPredictors.length > 0 && (
          <View style={styles.missingBox}>
            <Text variant="labelSmall" style={styles.missingText}>
              Faltan: {missingPredictors.map((m) => m.alias).join(', ')}
            </Text>
          </View>
        )}
        {showSpy && spyResults.length > 0 && (
          <View style={styles.missingBox}>
            <Text variant="labelSmall" style={styles.spyTitle}>🕵️ Espiaste:</Text>
            {spyResults.map((r, i) => (
              <Text key={i} variant="labelSmall" style={styles.spyResultText}>
                {r.alias}: {r.predictedHome}-{r.predictedAway}
              </Text>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export default function PredictionsTab() {
  const { group } = useCurrentGroup();
  const groupId = group?.id ?? '';
  const season = group?.season ?? '';
  // Permite llegar aquí ya filtrado a una jornada concreta desde otra pantalla
  // (ej. el botón de "Jornada N" en la vista de un partido).
  const params = useLocalSearchParams<{ matchday?: string }>();
  const [competitionTab, setCompetitionTab] = useState<Competition>('la_liga');
  // null = viendo todos los partidos en orden cronológico; un número = filtrado a esa jornada.
  const [filterMatchday, setFilterMatchday] = useState<number | null>(
    params.matchday ? parseInt(params.matchday, 10) : null
  );
  const [jornadaModalVisible, setJornadaModalVisible] = useState(false);
  const sectionListRef = useRef<SectionList<Match, MatchdaySection>>(null);
  const hasAutoScrolled = useRef(false);
  const lastScrollTarget = useRef<{ sectionIndex: number; itemIndex: number } | null>(null);

  function scrollToTarget(target: { sectionIndex: number; itemIndex: number }, animated: boolean) {
    lastScrollTarget.current = target;
    sectionListRef.current?.scrollToLocation({ ...target, animated, viewPosition: 0.15, viewOffset: 0 });
  }

  const { data: matches, isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
    enabled: !!season,
  });

  const { data: predictions, isLoading: loadingPredictions } = useQuery({
    queryKey: ['predictions', season, groupId],
    queryFn: () => predictionsApi.listMyPredictions(season, groupId),
    enabled: !!season && !!groupId,
  });

  const { data: missingByMatch } = useQuery({
    queryKey: ['missing-predictors', groupId, season],
    queryFn: () => predictionsApi.getMissingPredictors(groupId, season),
    enabled: !!season && !!groupId,
    staleTime: 60_000,
  });

  const { data: pressReveals } = useQuery({
    queryKey: ['press-reveals', groupId, season],
    queryFn: () => cardsApi.getPressConferenceReveals(groupId, season).then((r) => r.reveals),
    enabled: !!season && !!groupId,
    staleTime: 60_000,
  });

  const { data: spyResultsByMatch } = useQuery({
    queryKey: ['spy-results', groupId, season],
    queryFn: () => cardsApi.getMySpyResults(groupId, season).then((r) => r.results),
    enabled: !!season && !!groupId,
    staleTime: 60_000,
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

  const enabledCompetitions = settings?.enabledCompetitions ?? [];
  const hasCopaEnabled = enabledCompetitions.includes('copa_del_rey');
  const hasSupercopaEnabled = enabledCompetitions.includes('supercopa');

  // Si el tab activo deja de estar habilitado, volver a La Liga
  useEffect(() => {
    setCompetitionTab((tab) => {
      if (tab === 'copa_del_rey' && !hasCopaEnabled) return 'la_liga';
      if (tab === 'supercopa' && !hasSupercopaEnabled) return 'la_liga';
      return tab;
    });
  }, [hasCopaEnabled, hasSupercopaEnabled]);

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

  const predictionMap = useMemo(() => {
    const map = new Map<string, Prediction>();
    predictions?.forEach((p) => map.set(p.match._id, p));
    return map;
  }, [predictions]);

  // Todos los partidos de La Liga ordenados por fecha real de inicio (no por jornada) —
  // así un partido adelantado o aplazado aparece donde de verdad se juega, sin perderse.
  const sortedLaLigaMatches = useMemo(() => {
    if (!matches) return [];
    return matches
      .filter((m) => m.competition === 'la_liga' && m.matchday != null)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [matches]);

  // Se agrupan en secciones consecutivas por jornada (no por jornada completa): si un
  // partido de la jornada 5 se adelanta antes que el resto de la 4, aparece como su propia
  // sección "Jornada 5" en medio, y luego vuelve "Jornada 4" con el resto — nada se salta.
  const sections = useMemo<MatchdaySection[]>(() => {
    const result: MatchdaySection[] = [];
    for (const match of sortedLaLigaMatches) {
      const last = result[result.length - 1];
      if (last && last.matchday === match.matchday) {
        last.data.push(match);
      } else {
        result.push({ title: `Jornada ${match.matchday}`, matchday: match.matchday!, data: [match] });
      }
    }
    return result;
  }, [sortedLaLigaMatches]);

  // Punto de partida al abrir la pestaña: el partido más cercano a empezar (o el último
  // jugado si la temporada ya terminó), como sectionIndex/itemIndex para SectionList.
  const initialScrollTarget = useMemo(() => {
    if (sortedLaLigaMatches.length === 0) return null;
    const now = new Date();
    // Prioridad: un partido en curso ahora mismo > el próximo por empezar > el último jugado.
    let targetId = sortedLaLigaMatches.find(
      (m) => m.status !== 'finished' && new Date(m.startTime) <= now
    )?._id;
    if (!targetId) targetId = sortedLaLigaMatches.find((m) => new Date(m.startTime) > now)?._id;
    if (!targetId) targetId = sortedLaLigaMatches[sortedLaLigaMatches.length - 1]._id;
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const itemIndex = sections[sectionIndex].data.findIndex((m) => m._id === targetId);
      if (itemIndex !== -1) return { sectionIndex, itemIndex };
    }
    return null;
  }, [sortedLaLigaMatches, sections]);

  // Cuántos elementos hay que renderizar de entrada para que el partido objetivo ya esté
  // medido en el primer render — sin esto, scrollToLocation falla en listas largas (a medida
  // que avanza la temporada, el partido "actual" queda cada vez más lejos del principio) y
  // la lista se queda en la Jornada 1 en vez de saltar directamente a donde toca.
  const initialRenderCount = useMemo(() => {
    if (!initialScrollTarget) return 40;
    let count = 0;
    for (let s = 0; s < initialScrollTarget.sectionIndex; s++) {
      count += 1 + sections[s].data.length; // +1 por la cabecera "Jornada N" de la sección
    }
    count += 1 + initialScrollTarget.itemIndex + 1; // cabecera de la sección objetivo + colchón
    return Math.min(count + 20, 200);
  }, [initialScrollTarget, sections]);

  // Jornada "activa" para el banner de cartas: la filtrada si hay filtro, si no la del
  // partido más cercano/en curso (la misma a la que hace scroll el modo "Todos").
  const activeMatchday = filterMatchday ?? (
    initialScrollTarget ? sections[initialScrollTarget.sectionIndex]?.matchday ?? null : null
  );

  const { data: myDeal } = useQuery({
    queryKey: ['my-deal', groupId, season, activeMatchday],
    queryFn: () => cardsApi.getMyDeal(groupId, season, activeMatchday!),
    enabled: !!groupId && activeMatchday != null && competitionTab === 'la_liga',
  });

  const isLoading = loadingMatches || loadingPredictions;

  useEffect(() => {
    // La pestaña de Predicciones no se desmonta al navegar entre tabs, así que si ya estaba
    // montada y llegamos aquí de nuevo con un matchday distinto en la URL (ej. desde el botón
    // "Jornada N" de la vista de un partido), el useState inicial no lo recoge por sí solo.
    if (!params.matchday) return;
    const day = parseInt(params.matchday, 10);
    if (!isNaN(day)) setFilterMatchday(day);
  }, [params.matchday]);

  useEffect(() => {
    // Ojo: mientras isLoading es true el SectionList ni siquiera se monta (más abajo hay un
    // `return` anticipado), así que sectionListRef.current es null. Si este efecto marcase
    // hasAutoScrolled=true en ese momento, el scroll real nunca se reintentaría al terminar
    // de cargar y la lista se quedaría siempre en la Jornada 1.
    if (isLoading || filterMatchday !== null || hasAutoScrolled.current || !initialScrollTarget) return;
    hasAutoScrolled.current = true;
    // Se intenta varias veces: la lista puede no tener aún medidos los ítems lejanos en el
    // primer intento (scrollToLocation falla en silencio en ese caso), así que se repite
    // según se va renderizando más contenido.
    const t1 = setTimeout(() => scrollToTarget(initialScrollTarget, false), 80);
    const t2 = setTimeout(() => scrollToTarget(initialScrollTarget, false), 400);
    const t3 = setTimeout(() => scrollToTarget(initialScrollTarget, false), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isLoading, filterMatchday, initialScrollTarget]);

  function selectJornada(day: number) {
    setJornadaModalVisible(false);
    setFilterMatchday(day);
  }

  function clearFilter() {
    setFilterMatchday(null);
    // Al volver a "todos" se recoloca en el partido más cercano/en curso otra vez.
    hasAutoScrolled.current = false;
  }

  const filteredMatches = useMemo(() => {
    if (!matches) return [];
    if (competitionTab === 'la_liga') {
      return matches.filter((m) => m.competition === 'la_liga' && m.matchday === filterMatchday);
    }
    return matches.filter((m) => m.competition === competitionTab);
  }, [matches, competitionTab, filterMatchday]);

  const showAllView = competitionTab === 'la_liga' && filterMatchday === null;

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

      {/* Ir a jornada / título+volver, y banner de carta — todo en una sola fila (solo La Liga) */}
      {competitionTab === 'la_liga' && (
        <View style={styles.jornadaBar}>
          <Button
            mode="contained-tonal" compact icon="calendar-month"
            contentStyle={styles.jornadaBtnContent}
            onPress={() => setJornadaModalVisible(true)}
          >
            {(filterMatchday ?? activeMatchday) != null ? `Jornada ${filterMatchday ?? activeMatchday}` : 'Ir a jornada'}
          </Button>

          {activeMatchday != null && groupId && myDeal?.deal && myDeal.deal.status !== 'expired' && (
            <Button
              mode="contained-tonal"
              compact icon={myDeal.deal.status === 'locked' ? 'lock' : 'cards-playing'}
              onPress={() => router.push({
                pathname: '/cards/[groupId]' as never,
                params: { groupId, season, matchday: String(activeMatchday) },
              })}
              style={filterMatchday == null ? styles.cardBannerPushRight : styles.cardBanner}
            >
              {myDeal.deal.status === 'locked'
                ? '🔒 Carta bloqueada · Desbloquear'
                : `${CARD_EMOJI[myDeal.deal.card]} ${CARD_LABELS[myDeal.deal.card]}${myDeal.deal.status === 'pending' ? ' · Jugar' : ' · Jugada'}`
              }
            </Button>
          )}

          {filterMatchday != null && (
            <Button mode="text" compact icon="arrow-left" onPress={clearFilter} style={styles.volverBtn}>
              Volver
            </Button>
          )}
        </View>
      )}

      {showAllView ? (
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(m) => m._id}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text
                variant="labelLarge"
                style={styles.sectionHeaderText}
                onPress={() => selectJornada(section.matchday)}
              >
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              prediction={predictionMap.get(item._id)}
              season={season}
              groupId={groupId}
              multiplier={multipliers ? resolveMultiplier(item, multipliers) : null}
              missingPredictors={missingByMatch?.[item._id] ?? []}
              pressReveals={pressReveals?.[item._id] ?? []}
              spyResults={spyResultsByMatch?.[item._id] ?? []}
            />
          )}
          contentContainerStyle={styles.list}
          initialNumToRender={initialRenderCount}
          onScrollToIndexFailed={() => {
            // El objetivo aún no está medido (offscreen) — se reintenta un poco después,
            // cuando ya se ha renderizado más contenido de la lista.
            setTimeout(() => {
              if (lastScrollTarget.current) scrollToTarget(lastScrollTarget.current, false);
            }, 150);
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No hay partidos de La Liga todavía.</Text>
          }
        />
      ) : (
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
              missingPredictors={missingByMatch?.[item._id] ?? []}
              pressReveals={pressReveals?.[item._id] ?? []}
              spyResults={spyResultsByMatch?.[item._id] ?? []}
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
      )}

      <Portal>
        <Modal
          visible={jornadaModalVisible}
          onDismiss={() => setJornadaModalVisible(false)}
          contentContainerStyle={styles.jornadaModal}
        >
          <Text variant="titleMedium" style={styles.jornadaModalTitle}>Ir a jornada</Text>
          <ScrollView contentContainerStyle={styles.jornadaGrid}>
            {matchdays.map((day) => {
              const active = day === (filterMatchday ?? activeMatchday);
              return (
                <Chip
                  key={day}
                  mode={active ? 'flat' : 'outlined'}
                  selected={active}
                  style={[styles.jornadaChip, active && styles.jornadaChipActive]}
                  textStyle={active ? styles.jornadaChipActiveText : undefined}
                  onPress={() => selectJornada(day)}
                >
                  {day}
                </Chip>
              );
            })}
          </ScrollView>
        </Modal>
      </Portal>
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

  jornadaBar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8,
  },
  jornadaBtnContent: { flexDirection: 'row-reverse' },
  volverBtn: { marginLeft: 'auto' },
  jornadaModal: {
    backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 20,
    padding: 16, maxHeight: '75%',
  },
  jornadaModalTitle: { fontWeight: '700', marginBottom: 12 },
  jornadaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  jornadaChip: { minWidth: 52, alignItems: 'center' },
  jornadaChipActive: { backgroundColor: colors.primary },
  jornadaChipActiveText: { color: '#fff', fontWeight: '700' },
  sectionHeader: {
    backgroundColor: colors.bg, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 6,
  },
  sectionHeaderText: { fontWeight: '700', color: colors.primary },

  cardBanner: {},
  cardBannerPushRight: { marginLeft: 'auto' },
  list: { padding: 12, gap: 10, paddingBottom: 32 },
  emptyText: { textAlign: 'center', opacity: 0.5, marginTop: 40, fontStyle: 'italic' },
  matchCard: { width: '100%' },
  cardContent: { gap: 4, position: 'relative' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamCellRight: { justifyContent: 'flex-end' },
  crest: { width: 22, height: 22 },
  team: { flexShrink: 1 },
  teamRight: { textAlign: 'right' },
  vs: { opacity: 0.5 },
  pressRevealCol: { alignItems: 'flex-end', gap: 2 },
  pressRevealText: { color: colors.gold, fontWeight: '600' },
  scoreCenter: { fontWeight: '700', minWidth: 48, textAlign: 'center' },
  predCenter: { fontWeight: '600', minWidth: 48, textAlign: 'center', opacity: 0.75 },
  liveIndicator: { color: '#8892A4', fontWeight: '700', minWidth: 64, textAlign: 'center' },
  liveScore: { color: '#EF4444' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  liveBadgeText: { color: '#EF4444', fontWeight: '700' },
  whoMissingBtn: { marginRight: -8 },
  spyBtn: { minWidth: 0 },
  missingBox: { marginTop: 2 },
  missingText: { color: colors.text2, fontStyle: 'italic' },
  spyTitle: { color: colors.text2, fontWeight: '700' },
  spyResultText: { color: colors.text1, marginTop: 1 },
  multChip: { backgroundColor: '#FFBE0B', height: 24 },
  multText: { color: '#000000', fontWeight: '700', fontSize: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  dateText: { opacity: 0.5 },
  predictionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  predictionRowLeft: { flex: 1, alignItems: 'flex-start' },
  predictionRowRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  predictionText: { fontWeight: '600' },
  noPrediction: { opacity: 0.4, fontStyle: 'italic' },
});
