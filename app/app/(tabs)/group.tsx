import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator, Avatar, Button, Chip, IconButton,
  Surface, Text,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { rankingApi, RankingEntry } from '@/api/ranking';
import { penaltiesApi, RankingEntry as MatchdayRankingEntry } from '@/api/penalties';
import { adminGroupApi } from '@/api/adminGroup';
import { groupsApi } from '@/api/groups';
import { useAuth } from '@/context/AuthContext';
import { useCurrentGroup } from '@/context/CurrentGroupContext';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

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
          <Text variant="labelSmall" style={styles.exactScores}>
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

export default function GroupTab() {
  const { group, leaveGroup } = useCurrentGroup();
  const { user } = useAuth();
  const [view, setView] = useState<'matchday' | 'season'>('matchday');
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

  const { data: seasonRanking, isLoading: loadingSeason } = useQuery({
    queryKey: ['ranking', groupId, season],
    queryFn: () => rankingApi.get(groupId, season),
    enabled: !!groupId && view === 'season',
  });

  const { data: debt } = useQuery({
    queryKey: ['debt', groupId, season],
    queryFn: () => penaltiesApi.getDebt(groupId, season),
    enabled: !!groupId && view === 'season',
    staleTime: 5 * 60 * 1000,
  });

  const { data: matchdayData, isLoading: loadingMatchday } = useQuery({
    queryKey: ['ranking-matchday', groupId, season, matchday],
    queryFn: () => penaltiesApi.getMatchdayRanking(groupId, season, matchday),
    enabled: !!groupId && view === 'matchday',
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
  const hasKnockout = comps.includes('copa_del_rey') || comps.includes('supercopa');
  const isGroupAdmin = user?.id === groupDetail?.admin._id;

  const isLoading = view === 'season' ? loadingSeason : loadingMatchday;
  const listData: (RankingEntry | MatchdayRankingEntry)[] =
    view === 'season' ? (seasonRanking ?? []) : (matchdayData?.ranking ?? []);

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
            mode="outlined"
            compact
            icon={copied ? 'check' : 'content-copy'}
            onPress={copyCode}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </View>
      </Surface>

      {/* Accesos rápidos a otras predicciones */}
      {(hasStandings || hasPichichi || hasZamora || hasKnockout) && (
        <View style={styles.quickLinks}>
          {hasStandings && (
            <Button
              mode="outlined"
              compact
              icon="table"
              style={styles.quickBtn}
              onPress={() => router.push({ pathname: '/standings-prediction/[season]' as never, params: { season } })}
            >
              Clasificación
            </Button>
          )}
          {(hasPichichi || hasZamora) && (
            <Button
              mode="outlined"
              compact
              icon="medal"
              style={styles.quickBtn}
              onPress={() => router.push({ pathname: '/award-prediction/[season]' as never, params: { season, groupId } })}
            >
              Premios
            </Button>
          )}
          {hasKnockout && (
            <Button
              mode="outlined"
              compact
              icon="trophy-outline"
              style={styles.quickBtn}
              onPress={() => router.push({ pathname: '/knockout/[season]' as never, params: { season } })}
            >
              Copa / SC
            </Button>
          )}
        </View>
      )}

      {/* Toggle ranking + nav jornada */}
      <View style={styles.toggle}>
        <Chip selected={view === 'matchday'} onPress={() => setView('matchday')} style={styles.chip}>
          Por jornada
        </Chip>
        <Chip selected={view === 'season'} onPress={() => setView('season')} style={styles.chip}>
          Global
        </Chip>
      </View>

      {view === 'matchday' && (
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

      {isLoading && <ActivityIndicator style={{ marginVertical: 24 }} />}
    </View>
  );

  if (!group) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={isLoading ? [] : listData}
        keyExtractor={(e) => e.user.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) =>
          view === 'season' ? (
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
          !isLoading ? (
            <Text style={styles.empty}>Sin datos para esta jornada todavía.</Text>
          ) : null
        }
        contentContainerStyle={styles.list}
      />

      {/* Footer */}
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
  codeBox: { borderRadius: 10, padding: 14, marginBottom: 10, marginHorizontal: 0 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeLabel: { opacity: 0.6, marginBottom: 2 },
  codeValue: { letterSpacing: 2, fontWeight: '700' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  quickBtn: { flex: 1, minWidth: 100 },
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  chip: { flex: 1 },
  matchdayNav: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 0,
  },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, gap: 10 },
  rowMe: { borderWidth: 1.5, borderColor: '#1565C0' },
  posBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  posBoxDefault: { backgroundColor: '#E0E0E0' },
  posText: { fontWeight: '700', color: '#fff' },
  avatar: { backgroundColor: '#90A4AE' },
  userInfo: { flex: 1 },
  alias: { fontWeight: '500' },
  aliasMe: { color: '#1565C0', fontWeight: '700' },
  exactScores: { opacity: 0.5, marginTop: 1 },
  rightCol: { alignItems: 'flex-end', gap: 2 },
  points: { fontWeight: '700' },
  debt: { color: '#B45309', fontWeight: '600' },
  empty: { textAlign: 'center', opacity: 0.5, marginTop: 32 },
  footer: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  footerActions: { flexDirection: 'row', gap: 4 },
});
