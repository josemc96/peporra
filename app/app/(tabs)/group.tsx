import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Avatar, Button, Chip, IconButton,
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
import { colors } from '@/config/theme';

const MEDAL_COLORS = ['#FFBE0B', '#C0C0C0', '#CD7F32'];

// ─── Ranking rows ────────────────────────────────────────────────────────────

function SeasonRow({ entry, position, isMe, debt, total, onPress, onKick }: {
  entry: RankingEntry; position: number; isMe: boolean; debt: number; total: number;
  onPress: () => void; onKick?: () => void;
}) {
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#0001' }}>
      <Surface style={[styles.row, isMe && styles.rowMe]} elevation={isMe ? 2 : 1}>
        <View style={[styles.posBox, medalColor ? { backgroundColor: medalColor } : styles.posBoxDefault]}>
          <Text variant="titleMedium" style={styles.posText}>{position}</Text>
        </View>
        <Avatar.Text size={36} label={(entry.user.alias ?? '?').slice(0, 2).toUpperCase()} style={styles.avatar} />
        <View style={styles.userInfo}>
          <Text variant="bodyLarge" style={[styles.alias, isMe && styles.aliasMe]}>
            {entry.user.alias ?? '?'}{isMe ? '  (tú)' : ''}
          </Text>
          {entry.exactScores > 0 && (
            <Text variant="labelSmall" style={styles.exactLabel}>
              {entry.exactScores} exacto{entry.exactScores !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={styles.rightCol}>
          <Text variant="titleMedium" style={[styles.points, medalColor ? { color: medalColor } : undefined]}>
            {entry.points} pts
          </Text>
          {debt > 0 && <Text variant="labelSmall" style={styles.debt}>💸 {debt}€</Text>}
        </View>
        {onKick && (
          <IconButton icon="account-remove" size={20} onPress={(e) => { e.stopPropagation?.(); onKick(); }} />
        )}
      </Surface>
    </Pressable>
  );
}

function MatchdayRow({ entry, position, isMe, total, onPress, onKick }: {
  entry: MatchdayRankingEntry; position: number; isMe: boolean; total: number;
  onPress: () => void; onKick?: () => void;
}) {
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#0001' }}>
      <Surface style={[styles.row, isMe && styles.rowMe]} elevation={isMe ? 2 : 1}>
        <View style={[styles.posBox, medalColor ? { backgroundColor: medalColor } : styles.posBoxDefault]}>
          <Text variant="titleMedium" style={styles.posText}>{position}</Text>
        </View>
        <Avatar.Text size={36} label={(entry.user.alias ?? '?').slice(0, 2).toUpperCase()} style={styles.avatar} />
        <Text variant="bodyLarge" style={[styles.alias, styles.userInfo, isMe && styles.aliasMe]}>
          {entry.user.alias ?? '?'}{isMe ? '  (tú)' : ''}
        </Text>
        <View style={styles.rightCol}>
          <Text variant="titleMedium" style={[styles.points, medalColor ? { color: medalColor } : undefined]}>
            {entry.points} pts
          </Text>
          {entry.debt > 0 && <Text variant="labelSmall" style={styles.debt}>💸 {entry.debt}€</Text>}
        </View>
        {onKick && (
          <IconButton icon="account-remove" size={20} onPress={(e) => { e.stopPropagation?.(); onKick(); }} />
        )}
      </Surface>
    </Pressable>
  );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function GroupTab() {
  const { group, leaveGroup } = useCurrentGroup();
  const { user } = useAuth();
  const qc = useQueryClient();
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

  // Jornada "actual": la del partido en curso ahora mismo, o si no la del próximo por
  // empezar, o si no la última jugada (temporada terminada) — para no arrancar en la 1.
  const currentMatchday = useMemo(() => {
    if (!matches) return null;
    const laLiga = matches.filter((m) => m.competition === 'la_liga' && m.matchday != null);
    if (laLiga.length === 0) return null;
    const now = new Date();
    const live = laLiga.find((m) => m.status !== 'finished' && m.status !== 'postponed' && new Date(m.startTime) <= now);
    if (live) return live.matchday!;
    const upcoming = [...laLiga]
      .filter((m) => new Date(m.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
    if (upcoming) return upcoming.matchday!;
    const last = [...laLiga].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
    return last.matchday ?? null;
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

  const { data: matchdayData, isLoading: loadingMatchday } = useQuery({
    queryKey: ['ranking-matchday', groupId, season, matchday],
    queryFn: () => penaltiesApi.getMatchdayRanking(groupId, season, matchday),
    enabled: !!groupId && rankingView === 'matchday',
  });

  const debtMap = useMemo(() => {
    const map = new Map<string, number>();
    debt?.forEach((d) => map.set(d.user.id, d.total));
    return map;
  }, [debt]);

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
      {/* Bote acumulado de la peña (suma de la deuda de todos los usuarios) */}
      {totalDebt > 0 && (
        <Surface style={styles.totalDebtBox} elevation={1}>
          <Text variant="labelSmall" style={styles.totalDebtLabel}>💰 Bote acumulado de la peña</Text>
          <Text variant="titleLarge" style={styles.totalDebtValue}>{totalDebt}€</Text>
        </Surface>
      )}

      {/* Accesos rápidos */}
      <View style={styles.quickLinks}>
        <Button
          mode="outlined" compact icon="format-list-numbered" style={styles.quickBtn}
          onPress={() => router.push({ pathname: '/standings-table/[season]' as never, params: { season } })}
        >
          Tabla de La Liga
        </Button>
      </View>

      {/* Sub-tabs ranking */}
      <View style={styles.subTabs}>
        <Chip selected={rankingView === 'matchday'} onPress={() => setRankingView('matchday')} style={styles.chip}>
          Por jornada
        </Chip>
        <Chip selected={rankingView === 'season'} onPress={() => setRankingView('season')} style={styles.chip}>
          Global
        </Chip>
      </View>

      {rankingView === 'matchday' && (
        <View style={styles.matchdayNav}>
          <IconButton
            icon="chevron-left" size={28}
            onPress={() => setMatchday((d) => Math.max(1, d - 1))}
            disabled={matchday <= 1}
          />
          <Text variant="titleMedium" style={{ fontWeight: '600' }}>Jornada {matchday}</Text>
          <IconButton
            icon="chevron-right" size={28}
            onPress={() => setMatchday((d) => Math.min(38, d + 1))}
            disabled={matchday >= 38}
          />
        </View>
      )}

      {rankingIsLoading && <ActivityIndicator style={{ marginVertical: 24 }} />}
    </View>
  ), [totalDebt, season, rankingView, matchday, rankingIsLoading]);

  const renderItem = useCallback(({ item, index }: { item: RankingEntry | MatchdayRankingEntry; index: number }) => {
    const total = rankingData.length;
    const globalEntry = seasonRanking?.find((e) => e.user.id === item.user.id);
    const globalPos = seasonRanking ? (seasonRanking.findIndex((e) => e.user.id === item.user.id) + 1) : 0;
    const goToProfile = () => router.push({
      pathname: '/user/[userId]' as never,
      params: {
        userId: item.user.id,
        alias: item.user.alias,
        points: String(globalEntry?.points ?? 0),
        exactScores: String(globalEntry?.exactScores ?? 0),
        position: String(globalPos),
        total: String(seasonRanking?.length ?? total),
        groupId,
        season,
      },
    });
    const canKick = isGroupAdmin && item.user.id !== user?.id;
    return rankingView === 'season' ? (
      <SeasonRow
        entry={item as RankingEntry}
        position={index + 1}
        isMe={item.user.id === user?.id}
        debt={debtMap.get(item.user.id) ?? 0}
        total={total}
        onPress={goToProfile}
        onKick={canKick ? () => kick(item.user.id) : undefined}
      />
    ) : (
      <MatchdayRow
        entry={item as MatchdayRankingEntry}
        position={index + 1}
        isMe={item.user.id === user?.id}
        total={total}
        onPress={goToProfile}
        onKick={canKick ? () => kick(item.user.id) : undefined}
      />
    );
  }, [rankingData, seasonRanking, groupId, season, isGroupAdmin, user?.id, debtMap, rankingView, kick]);

  if (!group) return null;

  return (
    <View style={styles.container}>
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
    borderRadius: 10, padding: 14, marginBottom: 10, alignItems: 'center', gap: 2,
    backgroundColor: colors.errorDim,
  },
  totalDebtLabel: { color: colors.debt, opacity: 0.9 },
  totalDebtValue: { color: colors.debt, fontWeight: '700' },

  // Quick links
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  quickBtn: { flex: 1, minWidth: 100 },

  // Tabs
  subTabs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  chip: { flex: 1 },

  // Jornada nav
  matchdayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Ranking rows
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, gap: 10 },
  rowMe: { borderWidth: 1.5, borderColor: '#C04A1A' },
  posBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  posBoxDefault: { backgroundColor: '#1C2236' },
  posText: { fontWeight: '700', color: '#E8EAF2' },
  avatar: { backgroundColor: '#232B42' },
  userInfo: { flex: 1 },
  alias: { fontWeight: '500' },
  aliasMe: { color: '#C04A1A', fontWeight: '700' },
  exactLabel: { opacity: 0.5, marginTop: 1 },
  rightCol: { alignItems: 'flex-end', gap: 2 },
  points: { fontWeight: '700' },
  debt: { color: '#E88C00', fontWeight: '600' },
  emptyText: { textAlign: 'center', opacity: 0.5, marginTop: 32 },

  // Footer
  footer: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4 },
  footerActions: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
});
