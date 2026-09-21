import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Button, Chip,
  Menu, Surface, Text,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { rankingApi, RankingEntry } from '@/api/ranking';
import { penaltiesApi, RankingEntry as MatchdayRankingEntry } from '@/api/penalties';
import { adminGroupApi } from '@/api/adminGroup';
import { predictionsApi } from '@/api/predictions';
import { groupsApi } from '@/api/groups';
import { useAuth } from '@/context/AuthContext';
import { useCurrentGroup } from '@/context/CurrentGroupContext';
import { JornadaPicker } from '@/components/JornadaPicker';
import { TeamStandingsTable } from '@/components/TeamStandingsTable';
import { PlayerRow } from '@/components/PlayerRow';
import { colors } from '@/config/theme';

// ─── Main tab ────────────────────────────────────────────────────────────────

type MainView = 'usuarios' | 'equipos';

export default function GroupTab() {
  const { group, leaveGroup } = useCurrentGroup();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mainView, setMainView] = useState<MainView>('usuarios');
  const [rankingView, setRankingView] = useState<'matchday' | 'season'>('matchday');
  const [matchday, setMatchday] = useState(1);
  const [betsMenuVisible, setBetsMenuVisible] = useState(false);
  const hasSetCurrentMatchday = useRef(false);

  const groupId = group?.id ?? '';
  const season = group?.season ?? '';

  const { data: matches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
    enabled: !!season,
    staleTime: 5 * 60 * 1000,
  });

  const matchdays = useMemo(() => {
    if (!matches) return [];
    return [
      ...new Set(
        matches.filter((m) => m.competition === 'la_liga' && m.matchday != null).map((m) => m.matchday!)
      ),
    ].sort((a, b) => a - b);
  }, [matches]);

  // Jornada "actual": la del partido en curso ahora mismo, o si no la última ya jugada, o
  // si no la ha habido ninguna todavía la próxima por empezar (inicio de temporada).
  const currentMatchday = useMemo(() => {
    if (!matches) return null;
    const laLiga = matches.filter((m) => m.competition === 'la_liga' && m.matchday != null);
    if (laLiga.length === 0) return null;
    const now = new Date();
    const live = laLiga.find((m) => m.status !== 'finished' && m.status !== 'postponed' && new Date(m.startTime) <= now);
    if (live) return live.matchday!;
    const sorted = [...laLiga].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].status === 'finished') return sorted[i].matchday!;
    }
    const upcoming = sorted.find((m) => new Date(m.startTime) > now);
    if (upcoming) return upcoming.matchday!;
    return sorted[sorted.length - 1].matchday ?? null;
  }, [matches]);

  useEffect(() => {
    if (hasSetCurrentMatchday.current || currentMatchday == null) return;
    hasSetCurrentMatchday.current = true;
    setMatchday(currentMatchday);
  }, [currentMatchday]);

  const { data: groupDetail } = useQuery({
    queryKey: ['group-detail', groupId],
    queryFn: () => groupsApi.get(groupId),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: seasonRanking, isLoading: loadingSeason } = useQuery({
    queryKey: ['ranking', groupId, season],
    queryFn: () => rankingApi.get(groupId, season),
    enabled: !!groupId,
  });

  // Se pide siempre (no solo en la vista de ranking) porque el bote total de la peña se
  // muestra en la cabecera con independencia de la pestaña/sub-vista activa.
  const { data: debt } = useQuery({
    queryKey: ['debt', groupId, season],
    queryFn: () => penaltiesApi.getDebt(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const totalDebt = useMemo(
    () => debt?.reduce((sum, d) => sum + d.total, 0) ?? 0,
    [debt]
  );

  // Se pide siempre (no solo en la vista "Por jornada") porque cada fila muestra los 4
  // datos a la vez — el de jornada hace falta también estando en la vista "Global".
  const { data: matchdayData, isLoading: loadingMatchday } = useQuery({
    queryKey: ['ranking-matchday', groupId, season, matchday],
    queryFn: () => penaltiesApi.getMatchdayRanking(groupId, season, matchday),
    enabled: !!groupId,
  });

  const debtMap = useMemo(() => {
    const map = new Map<string, number>();
    debt?.forEach((d) => map.set(d.user.id, d.total));
    return map;
  }, [debt]);

  const seasonMap = useMemo(() => {
    const map = new Map<string, RankingEntry>();
    seasonRanking?.forEach((e) => map.set(e.user.id, e));
    return map;
  }, [seasonRanking]);

  const matchdayMap = useMemo(() => {
    const map = new Map<string, MatchdayRankingEntry>();
    matchdayData?.ranking.forEach((e) => map.set(e.user.id, e));
    return map;
  }, [matchdayData]);

  const handleLeave = useCallback(async () => {
    await leaveGroup();
    router.replace('/(tabs)' as never);
  }, [leaveGroup]);

  const { mutate: kick } = useMutation({
    mutationFn: (userId: string) => groupsApi.kick(groupId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ranking', groupId, season] }),
  });

  const feats = settings?.enabledFeatures ?? [];
  const comps = settings?.enabledCompetitions ?? [];
  const hasStandings = feats.includes('standings');
  const hasPichichi = feats.includes('pichichi');
  const hasZamora = feats.includes('zamora');
  const hasPremios = hasPichichi || hasZamora;
  const isGroupAdmin = user?.id === groupDetail?.admin._id;

  const rankingIsLoading = rankingView === 'season' ? loadingSeason : loadingMatchday;
  const rankingData: (RankingEntry | MatchdayRankingEntry)[] =
    rankingView === 'season' ? (seasonRanking ?? []) : (matchdayData?.ranking ?? []);

  const flatListData = useMemo(
    () => (!rankingIsLoading ? rankingData : []),
    [rankingIsLoading, rankingData],
  );

  const renderHeader = useCallback(() => (
    <View>
      {/* Sub-tabs ranking */}
      <View style={styles.subTabs}>
        <Chip selected={rankingView === 'matchday'} onPress={() => setRankingView('matchday')} style={styles.chip}>
          Por jornada
        </Chip>
        <Chip selected={rankingView === 'season'} onPress={() => setRankingView('season')} style={styles.chip}>
          Global
        </Chip>
      </View>

      {rankingView === 'matchday' ? (
        <View style={styles.matchdayNav}>
          <JornadaPicker matchdays={matchdays} selected={matchday} onSelect={setMatchday} />
          <Text variant="titleMedium" style={styles.matchdayLabel}>Jornada {matchday}</Text>
        </View>
      ) : (
        // Bote acumulado de la peña — solo en la vista Global, no tiene sentido por jornada.
        totalDebt > 0 && (
          <Surface style={styles.totalDebtBox} elevation={1}>
            <Text variant="labelSmall" style={styles.totalDebtLabel}>💰 Bote acumulado de la peña</Text>
            <Text variant="titleLarge" style={styles.totalDebtValue}>{totalDebt}€</Text>
          </Surface>
        )
      )}

      {rankingIsLoading && <ActivityIndicator style={{ marginVertical: 24 }} />}
    </View>
  ), [rankingView, matchday, matchdays, rankingIsLoading, totalDebt]);

  const renderItem = useCallback(({ item, index }: { item: RankingEntry | MatchdayRankingEntry; index: number }) => {
    const seasonEntry = seasonMap.get(item.user.id);
    const matchdayEntry = matchdayMap.get(item.user.id);
    const globalPos = seasonRanking ? (seasonRanking.findIndex((e) => e.user.id === item.user.id) + 1) : 0;
    const goToProfile = () => router.push({
      pathname: '/user/[userId]' as never,
      params: {
        userId: item.user.id,
        alias: item.user.alias,
        points: String(seasonEntry?.points ?? 0),
        exactScores: String(seasonEntry?.exactScores ?? 0),
        position: String(globalPos),
        total: String(seasonRanking?.length ?? rankingData.length),
        groupId,
        season,
      },
    });
    const canKick = isGroupAdmin && item.user.id !== user?.id;

    return (
      <PlayerRow
        alias={item.user.alias}
        isMe={item.user.id === user?.id}
        position={index + 1}
        exactScores={seasonEntry?.exactScores ?? 0}
        rankingView={rankingView}
        matchday={matchday}
        seasonPoints={seasonEntry?.points ?? 0}
        matchdayPoints={matchdayEntry?.points ?? 0}
        seasonDebt={debtMap.get(item.user.id) ?? 0}
        matchdayDebt={matchdayEntry?.debt ?? 0}
        onPress={goToProfile}
        onKick={canKick ? () => kick(item.user.id) : undefined}
      />
    );
  }, [rankingData, seasonRanking, seasonMap, matchdayMap, groupId, season, isGroupAdmin, user?.id, debtMap, rankingView, matchday, kick]);

  if (!group) return null;

  return (
    <View style={styles.container}>
      {/* Usuarios / Tabla Liga */}
      <View style={styles.mainViewTabs}>
        <Chip selected={mainView === 'usuarios'} onPress={() => setMainView('usuarios')} style={styles.chip} icon="account-group">
          Usuarios
        </Chip>
        <Chip selected={mainView === 'equipos'} onPress={() => setMainView('equipos')} style={styles.chip} icon="soccer">
          Tabla Liga
        </Chip>
      </View>

      {mainView === 'equipos' ? (
        <TeamStandingsTable season={season} />
      ) : (
        <FlatList
          data={flatListData}
          keyExtractor={(e) => e.user.id}
          ListHeaderComponent={renderHeader}
          renderItem={renderItem}
          ListEmptyComponent={
            !rankingIsLoading ? (
              <Text style={styles.emptyText}>Sin datos para esta jornada todavía.</Text>
            ) : null
          }
          contentContainerStyle={styles.list}
        />
      )}

      <Surface style={styles.footer} elevation={3}>
        <View style={styles.footerActions}>
          {(hasStandings || hasPremios) && (
            <Menu
              visible={betsMenuVisible}
              onDismiss={() => setBetsMenuVisible(false)}
              anchor={
                <Button
                  compact mode="text" icon="trophy-outline"
                  onPress={() => {
                    // Si solo hay una opción activa, no hace falta el desplegable —
                    // se va directo a su vista.
                    if (hasPremios && !hasStandings) {
                      router.push({ pathname: '/premios/[groupId]' as never, params: { groupId, season } });
                    } else if (hasStandings && !hasPremios) {
                      router.push({ pathname: '/standings-prediction/[season]' as never, params: { groupId, season } });
                    } else {
                      setBetsMenuVisible(true);
                    }
                  }}
                >
                  Apuestas
                </Button>
              }
            >
              {hasPremios && (
                <Menu.Item
                  leadingIcon="trophy"
                  title="Premios"
                  onPress={() => {
                    setBetsMenuVisible(false);
                    router.push({ pathname: '/premios/[groupId]' as never, params: { groupId, season } });
                  }}
                />
              )}
              {hasStandings && (
                <Menu.Item
                  leadingIcon="format-list-numbered"
                  title="Clasificación (Ida/Vuelta)"
                  onPress={() => {
                    setBetsMenuVisible(false);
                    router.push({ pathname: '/standings-prediction/[season]' as never, params: { groupId, season } });
                  }}
                />
              )}
            </Menu>
          )}
          {isGroupAdmin && (
            <Button
              compact mode="text" icon="cog"
              onPress={() => router.push({ pathname: '/admin/[groupId]' as never, params: { groupId, season } })}
            >
              Admin
            </Button>
          )}
          <Button compact mode="text" icon="swap-horizontal" onPress={handleLeave}>
            Cambiar peña
          </Button>
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 12, gap: 8, paddingBottom: 8 },

  // Bote total
  totalDebtBox: {
    borderRadius: 10, padding: 14, marginBottom: 4, alignItems: 'center', gap: 2,
    backgroundColor: colors.errorDim,
  },
  totalDebtLabel: { color: colors.debt, opacity: 0.9 },
  totalDebtValue: { color: colors.debt, fontWeight: '700' },

  // Tabs
  mainViewTabs: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  subTabs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  chip: { flex: 1 },

  // Jornada nav
  matchdayNav: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  matchdayLabel: { fontWeight: '600' },

  emptyText: { textAlign: 'center', opacity: 0.5, marginTop: 32 },

  // Footer
  footer: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4 },
  footerActions: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
});
