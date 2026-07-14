import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Avatar, Button, Chip, IconButton,
  List, Surface, Text,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { rankingApi, RankingEntry } from '@/api/ranking';
import { penaltiesApi, RankingEntry as MatchdayRankingEntry } from '@/api/penalties';
import { adminGroupApi } from '@/api/adminGroup';
import { groupsApi } from '@/api/groups';
import { predictionsApi } from '@/api/predictions';
import { awardPredictionsApi, Award } from '@/api/awardPredictions';
import { useAuth } from '@/context/AuthContext';
import { useCurrentGroup } from '@/context/CurrentGroupContext';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

// ─── Ranking rows ────────────────────────────────────────────────────────────

function SeasonRow({ entry, position, isMe, debt }: {
  entry: RankingEntry; position: number; isMe: boolean; debt: number;
}) {
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;
  return (
    <Surface style={[styles.row, isMe && styles.rowMe]} elevation={isMe ? 2 : 1}>
      <View style={[styles.posBox, medalColor ? { backgroundColor: medalColor } : styles.posBoxDefault]}>
        <Text variant="titleMedium" style={styles.posText}>{position}</Text>
      </View>
      <Avatar.Text size={36} label={entry.user.alias.slice(0, 2).toUpperCase()} style={styles.avatar} />
      <View style={styles.userInfo}>
        <Text variant="bodyLarge" style={[styles.alias, isMe && styles.aliasMe]}>
          {entry.user.alias}{isMe ? '  (tú)' : ''}
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
    </Surface>
  );
}

function MatchdayRow({ entry, position, isMe }: {
  entry: MatchdayRankingEntry; position: number; isMe: boolean;
}) {
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;
  return (
    <Surface style={[styles.row, isMe && styles.rowMe]} elevation={isMe ? 2 : 1}>
      <View style={[styles.posBox, medalColor ? { backgroundColor: medalColor } : styles.posBoxDefault]}>
        <Text variant="titleMedium" style={styles.posText}>{position}</Text>
      </View>
      <Avatar.Text size={36} label={entry.user.alias.slice(0, 2).toUpperCase()} style={styles.avatar} />
      <Text variant="bodyLarge" style={[styles.alias, styles.userInfo, isMe && styles.aliasMe]}>
        {entry.user.alias}{isMe ? '  (tú)' : ''}
      </Text>
      <Text variant="titleMedium" style={[styles.points, medalColor ? { color: medalColor } : undefined]}>
        {entry.points} pts
      </Text>
    </Surface>
  );
}

// ─── Premios section ──────────────────────────────────────────────────────────

function PremiosSection({
  groupId, season, isSeasonLocked,
  hasPichichi, hasZamora,
}: {
  groupId: string; season: string; isSeasonLocked: boolean;
  hasPichichi: boolean; hasZamora: boolean;
}) {
  const awards: Award[] = [
    ...(hasPichichi ? ['pichichi' as Award] : []),
    ...(hasZamora ? ['zamora' as Award] : []),
  ];
  const [activeAward, setActiveAward] = useState<Award>(awards[0] ?? 'pichichi');

  const { data: groupPredictions, isLoading } = useQuery({
    queryKey: ['group-award-predictions', groupId, season, activeAward],
    queryFn: () => awardPredictionsApi.getGroupPredictions(groupId, season, activeAward),
    enabled: isSeasonLocked && !!groupId,
  });

  const { data: myPrediction } = useQuery({
    queryKey: ['my-award-prediction', season, activeAward],
    queryFn: () => awardPredictionsApi.get(season, activeAward),
    enabled: !isSeasonLocked && !!season,
  });

  return (
    <View style={styles.premiosContainer}>
      {/* Sub-tabs Pichichi / Zamora */}
      {awards.length > 1 && (
        <View style={styles.subTabs}>
          {awards.map((a) => (
            <Chip
              key={a}
              selected={activeAward === a}
              onPress={() => setActiveAward(a)}
              style={styles.chip}
            >
              {a === 'pichichi' ? '⚽ Pichichi' : '🧤 Zamora'}
            </Chip>
          ))}
        </View>
      )}

      {!isSeasonLocked ? (
        /* Temporada no empezada: mostrar mi predicción + botón de editar */
        <View style={styles.premiosPreSeason}>
          {myPrediction ? (
            <Text variant="bodyLarge" style={styles.myPredText}>
              Tu apuesta: <Text style={styles.myPredPlayer}>{myPrediction.predictedPlayer}</Text>
            </Text>
          ) : (
            <Text variant="bodyMedium" style={styles.noPredText}>
              Aún no has apostado por {activeAward === 'pichichi' ? 'el Pichichi' : 'el Zamora'}
            </Text>
          )}
          <Button
            mode="contained-tonal"
            icon={activeAward === 'pichichi' ? 'soccer' : 'shield'}
            onPress={() => router.push({
              pathname: '/award-prediction/[season]' as never,
              params: { season, groupId, initialAward: activeAward },
            })}
          >
            {myPrediction ? 'Cambiar apuesta' : 'Apostar'}
          </Button>
        </View>
      ) : (
        /* Temporada empezada: lista de apuestas de todos los miembros */
        isLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : !groupPredictions?.length ? (
          <Text style={styles.emptyText}>
            Ningún miembro ha apostado por {activeAward === 'pichichi' ? 'el Pichichi' : 'el Zamora'}.
          </Text>
        ) : (
          <View style={styles.predList}>
            {groupPredictions.map((p) => (
              <Surface key={p._id} style={styles.predRow} elevation={1}>
                <Avatar.Text size={32} label={p.user.alias.slice(0, 2).toUpperCase()} style={styles.avatar} />
                <View style={styles.userInfo}>
                  <Text variant="bodyMedium" style={styles.alias}>{p.user.alias}</Text>
                </View>
                <Text variant="titleSmall" style={styles.predPlayer}>{p.predictedPlayer}</Text>
              </Surface>
            ))}
          </View>
        )
      )}
    </View>
  );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

type MainTab = 'ranking' | 'premios';

export default function GroupTab() {
  const { group, leaveGroup } = useCurrentGroup();
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>('ranking');
  const [rankingView, setRankingView] = useState<'matchday' | 'season'>('matchday');
  const [matchday, setMatchday] = useState(1);
  const [copied, setCopied] = useState(false);

  const groupId = group?.id ?? '';
  const season = group?.season ?? '';

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

  // Detectar si la temporada ha empezado (mismo criterio que el backend: primer partido de La Liga)
  const { data: matches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
    enabled: !!season,
    staleTime: 5 * 60 * 1000,
  });

  const isSeasonLocked = useMemo(() => {
    if (!matches?.length) return false;
    const laLiga = matches.filter((m) => m.competition === 'la_liga');
    if (!laLiga.length) return false;
    const kickoff = Math.min(...laLiga.map((m) => new Date(m.startTime).getTime()));
    return Date.now() >= kickoff;
  }, [matches]);

  const { data: seasonRanking, isLoading: loadingSeason } = useQuery({
    queryKey: ['ranking', groupId, season],
    queryFn: () => rankingApi.get(groupId, season),
    enabled: !!groupId && rankingView === 'season' && mainTab === 'ranking',
  });

  const { data: debt } = useQuery({
    queryKey: ['debt', groupId, season],
    queryFn: () => penaltiesApi.getDebt(groupId, season),
    enabled: !!groupId && rankingView === 'season' && mainTab === 'ranking',
    staleTime: 5 * 60 * 1000,
  });

  const { data: matchdayData, isLoading: loadingMatchday } = useQuery({
    queryKey: ['ranking-matchday', groupId, season, matchday],
    queryFn: () => penaltiesApi.getMatchdayRanking(groupId, season, matchday),
    enabled: !!groupId && rankingView === 'matchday' && mainTab === 'ranking',
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

  async function copyCode() {
    const code = groupDetail?.inviteCode;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const feats = settings?.enabledFeatures ?? [];
  const comps = settings?.enabledCompetitions ?? [];
  const hasStandings = feats.includes('standings');
  const hasPichichi = feats.includes('pichichi');
  const hasZamora = feats.includes('zamora');
  const hasPremios = hasPichichi || hasZamora;
  const hasKnockout = comps.includes('copa_del_rey') || comps.includes('supercopa');
  const isGroupAdmin = user?.id === groupDetail?.admin._id;

  const rankingIsLoading = rankingView === 'season' ? loadingSeason : loadingMatchday;
  const rankingData: (RankingEntry | MatchdayRankingEntry)[] =
    rankingView === 'season' ? (seasonRanking ?? []) : (matchdayData?.ranking ?? []);

  if (!group) return null;

  const ListHeader = (
    <View>
      {/* Código de invitación */}
      <Surface style={styles.codeBox} elevation={1}>
        <View style={styles.codeRow}>
          <View>
            <Text variant="labelSmall" style={styles.codeLabel}>Código de invitación</Text>
            <Text variant="titleMedium" style={styles.codeValue}>
              {groupDetail?.inviteCode ?? '···'}
            </Text>
          </View>
          <Button
            mode="outlined" compact
            icon={copied ? 'check' : 'content-copy'}
            onPress={copyCode}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </View>
      </Surface>

      {/* Accesos rápidos */}
      {(hasStandings || (!isSeasonLocked && hasPremios) || hasKnockout) && (
        <View style={styles.quickLinks}>
          {hasStandings && (
            <Button
              mode="outlined" compact icon="table" style={styles.quickBtn}
              onPress={() => router.push({ pathname: '/standings-prediction/[season]' as never, params: { season } })}
            >
              Clasificación
            </Button>
          )}
          {!isSeasonLocked && hasPremios && (
            <Button
              mode="outlined" compact icon="medal" style={styles.quickBtn}
              onPress={() => router.push({ pathname: '/award-prediction/[season]' as never, params: { season, groupId } })}
            >
              Premios
            </Button>
          )}
          {hasKnockout && (
            <Button
              mode="outlined" compact icon="trophy-outline" style={styles.quickBtn}
              onPress={() => router.push({ pathname: '/knockout/[season]' as never, params: { season } })}
            >
              Copa / SC
            </Button>
          )}
        </View>
      )}

      {/* Tabs principales */}
      <View style={styles.mainTabs}>
        <Chip selected={mainTab === 'ranking'} onPress={() => setMainTab('ranking')} style={styles.chip}>
          Clasificación
        </Chip>
        {hasPremios && (
          <Chip selected={mainTab === 'premios'} onPress={() => setMainTab('premios')} style={styles.chip}>
            Premios
          </Chip>
        )}
      </View>

      {/* Contenido de Premios (no usa FlatList, es estático) */}
      {mainTab === 'premios' && hasPremios && (
        <PremiosSection
          groupId={groupId}
          season={season}
          isSeasonLocked={isSeasonLocked}
          hasPichichi={hasPichichi}
          hasZamora={hasZamora}
        />
      )}

      {/* Sub-tabs ranking */}
      {mainTab === 'ranking' && (
        <>
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
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={mainTab === 'ranking' && !rankingIsLoading ? rankingData : []}
        keyExtractor={(e) => e.user.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) =>
          rankingView === 'season' ? (
            <SeasonRow
              entry={item as RankingEntry}
              position={index + 1}
              isMe={item.user.id === user?.id}
              debt={debtMap.get(item.user.id) ?? 0}
            />
          ) : (
            <MatchdayRow
              entry={item as MatchdayRankingEntry}
              position={index + 1}
              isMe={item.user.id === user?.id}
            />
          )
        }
        ListEmptyComponent={
          mainTab === 'ranking' && !rankingIsLoading ? (
            <Text style={styles.emptyText}>Sin datos para esta jornada todavía.</Text>
          ) : null
        }
        contentContainerStyle={styles.list}
      />

      <Surface style={styles.footer} elevation={3}>
        <View style={styles.footerActions}>
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
  container: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 8 },

  // Código
  codeBox: { borderRadius: 10, padding: 14, marginBottom: 10 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeLabel: { opacity: 0.6, marginBottom: 2 },
  codeValue: { letterSpacing: 2, fontWeight: '700' },

  // Quick links
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  quickBtn: { flex: 1, minWidth: 100 },

  // Tabs
  mainTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  subTabs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  chip: { flex: 1 },

  // Jornada nav
  matchdayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Ranking rows
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, gap: 10 },
  rowMe: { borderWidth: 1.5, borderColor: '#1565C0' },
  posBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  posBoxDefault: { backgroundColor: '#E0E0E0' },
  posText: { fontWeight: '700', color: '#fff' },
  avatar: { backgroundColor: '#90A4AE' },
  userInfo: { flex: 1 },
  alias: { fontWeight: '500' },
  aliasMe: { color: '#1565C0', fontWeight: '700' },
  exactLabel: { opacity: 0.5, marginTop: 1 },
  rightCol: { alignItems: 'flex-end', gap: 2 },
  points: { fontWeight: '700' },
  debt: { color: '#B45309', fontWeight: '600' },
  emptyText: { textAlign: 'center', opacity: 0.5, marginTop: 32 },

  // Premios
  premiosContainer: { gap: 12 },
  premiosPreSeason: { gap: 12, alignItems: 'flex-start' },
  myPredText: { opacity: 0.8 },
  myPredPlayer: { fontWeight: '700', opacity: 1 },
  noPredText: { opacity: 0.5, fontStyle: 'italic' },
  predList: { gap: 8 },
  predRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, padding: 10, gap: 10,
  },
  predPlayer: { fontWeight: '700', color: '#1565C0' },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingVertical: 4 },
  footerActions: { flexDirection: 'row', gap: 4 },
});
