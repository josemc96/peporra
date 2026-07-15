import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, Surface, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { useCurrentGroup } from '@/context/CurrentGroupContext';
import { rankingApi } from '@/api/ranking';
import { adminGroupApi } from '@/api/adminGroup';
import { awardPredictionsApi } from '@/api/awardPredictions';
import { standingsPredictionsApi, StandingsPrediction } from '@/api/standingsPredictions';
import { apiFetch } from '@/api/client';

// ─── helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#1565C0', '#2E7D32', '#6A1B9A', '#AD1457',
  '#00695C', '#E65100', '#283593', '#4527A0',
];

function avatarColor(alias: string): string {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) hash = alias.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: string | number; label: string }) {
  const theme = useTheme();
  return (
    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
      <Text variant="headlineMedium" style={styles.statValue}>{value}</Text>
      <Text variant="labelSmall" style={styles.statLabel}>{label}</Text>
    </Surface>
  );
}

function StandingsCard({ prediction, phase }: { prediction: StandingsPrediction; phase: 'ida' | 'vuelta' }) {
  const sorted = [...prediction.predictedTable].sort((a, b) => a.position - b.position);
  return (
    <Surface style={styles.standingsCard} elevation={1}>
      <Text variant="labelMedium" style={styles.standingsTitle}>
        Clasificación — {phase === 'ida' ? 'Vuelta de ida (J19)' : 'Clasificación final (J38)'}
      </Text>
      <View style={styles.standingsTable}>
        {sorted.map((row) => (
          <View key={row.position} style={styles.standingsRow}>
            <Text variant="labelMedium" style={styles.standingsPos}>{row.position}</Text>
            <Text variant="bodySmall" style={styles.standingsTeam} numberOfLines={1}>{row.team}</Text>
          </View>
        ))}
      </View>
    </Surface>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { group } = useCurrentGroup();
  const theme = useTheme();

  const groupId = group?.id ?? '';
  const season = group?.season ?? '';

  const { data: ranking } = useQuery({
    queryKey: ['ranking', groupId, season],
    queryFn: () => rankingApi.get(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, season),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: seasonStatus } = useQuery({
    queryKey: ['season-locked', season],
    queryFn: () => apiFetch<{ locked: boolean; vueltaStarted: boolean }>(
      `/season/is-locked?season=${encodeURIComponent(season)}`
    ),
    enabled: !!season,
    staleTime: 5 * 60 * 1000,
  });

  const isSeasonLocked = seasonStatus?.locked ?? false;
  const isVueltaStarted = seasonStatus?.vueltaStarted ?? false;

  const feats = settings?.enabledFeatures ?? [];
  const hasPichichi = feats.includes('pichichi');
  const hasZamora = feats.includes('zamora');
  const hasStandings = feats.includes('standings');

  const { data: pichichi } = useQuery({
    queryKey: ['my-award-prediction', season, 'pichichi'],
    queryFn: () => awardPredictionsApi.get(season, 'pichichi'),
    enabled: hasPichichi && !!season,
    staleTime: 5 * 60 * 1000,
  });

  const { data: zamora } = useQuery({
    queryKey: ['my-award-prediction', season, 'zamora'],
    queryFn: () => awardPredictionsApi.get(season, 'zamora'),
    enabled: hasZamora && !!season,
    staleTime: 5 * 60 * 1000,
  });

  const { data: idaPrediction } = useQuery({
    queryKey: ['standings-prediction', season, 'ida'],
    queryFn: () => standingsPredictionsApi.get(season, 'ida'),
    enabled: hasStandings && !!season,
    staleTime: 5 * 60 * 1000,
  });

  const { data: vueltaPrediction } = useQuery({
    queryKey: ['standings-prediction', season, 'vuelta'],
    queryFn: () => standingsPredictionsApi.get(season, 'vuelta'),
    enabled: hasStandings && !!season,
    staleTime: 5 * 60 * 1000,
  });

  const myStats = useMemo(() => {
    if (!ranking || !user) return null;
    const pos = ranking.findIndex((e) => e.user.id === user.id);
    if (pos === -1) return null;
    return { points: ranking[pos].points, exactScores: ranking[pos].exactScores, position: pos + 1, total: ranking.length };
  }, [ranking, user]);

  const showBetsSection = !!group && (hasPichichi || hasZamora || hasStandings);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (!user) return null;

  const color = avatarColor(user.alias);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: color + '18' }]}>
        <Avatar.Text
          size={80}
          label={user.alias.slice(0, 2).toUpperCase()}
          style={{ backgroundColor: color }}
          labelStyle={{ color: '#fff', fontWeight: '700', fontSize: 28 }}
        />
        <Text variant="headlineSmall" style={styles.alias}>{user.alias}</Text>
        <Text variant="bodyMedium" style={styles.email}>{user.email}</Text>
        {user.role === 'admin' && (
          <View style={[styles.adminBadge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Admin global
            </Text>
          </View>
        )}
      </View>

      {/* Stats de temporada */}
      {group && (
        <View style={styles.statsSection}>
          <Text variant="labelMedium" style={styles.sectionLabel}>
            {group.name} · {season}
          </Text>
          <View style={styles.statsRow}>
            <StatCard value={myStats?.points ?? '—'} label="Puntos" />
            <StatCard value={myStats?.exactScores ?? '—'} label="Exactos" />
            <StatCard value={myStats ? `${myStats.position}/${myStats.total}` : '—'} label="Posición" />
          </View>
        </View>
      )}

      {/* Mis apuestas de temporada */}
      {showBetsSection && (
        <>
          <Divider style={styles.divider} />
          <View style={styles.betsSection}>
            <Text variant="titleSmall" style={styles.betsTitle}>Mis apuestas de temporada</Text>

            {/* Pichichi */}
            {hasPichichi && (
              <Surface style={styles.betCard} elevation={1}>
                <Text variant="labelSmall" style={styles.betLabel}>Pichichi</Text>
                <Text variant="titleMedium" style={styles.betValue}>
                  {pichichi?.predictedPlayer ?? <Text style={styles.betEmpty}>Sin predicción</Text>}
                </Text>
              </Surface>
            )}

            {/* Zamora */}
            {hasZamora && (
              <Surface style={styles.betCard} elevation={1}>
                <Text variant="labelSmall" style={styles.betLabel}>Zamora</Text>
                <Text variant="titleMedium" style={styles.betValue}>
                  {zamora?.predictedPlayer ?? <Text style={styles.betEmpty}>Sin predicción</Text>}
                </Text>
              </Surface>
            )}

            {/* Clasificación Ida */}
            {hasStandings && idaPrediction && (
              <StandingsCard prediction={idaPrediction} phase="ida" />
            )}

            {/* Clasificación Vuelta */}
            {hasStandings && vueltaPrediction && (
              <StandingsCard prediction={vueltaPrediction} phase="vuelta" />
            )}
          </View>
        </>
      )}

      <Divider style={styles.divider} />

      {/* Acciones */}
      <View style={styles.actions}>
        {user.role === 'admin' && (
          <Button
            mode="contained-tonal"
            icon="shield-crown"
            contentStyle={styles.btnContent}
            onPress={() => router.push('/admin/global' as never)}
          >
            Panel de admin global
          </Button>
        )}
        <Button
          mode="outlined"
          icon="logout"
          contentStyle={styles.btnContent}
          onPress={handleLogout}
          textColor={theme.colors.error}
          style={{ borderColor: theme.colors.errorContainer }}
        >
          Cerrar sesión
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flexGrow: 1, paddingBottom: 40 },

  // Hero
  hero: { alignItems: 'center', gap: 8, paddingVertical: 36, paddingHorizontal: 24 },
  alias: { fontWeight: '700', marginTop: 4 },
  email: { opacity: 0.55 },
  adminBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 2 },

  // Stats
  statsSection: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  sectionLabel: { opacity: 0.5, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 16, gap: 4 },
  statValue: { fontWeight: '700' },
  statLabel: { opacity: 0.55 },

  // Bets section
  betsSection: { paddingHorizontal: 20, gap: 12 },
  betsTitle: { fontWeight: '700', opacity: 0.7 },
  betCard: { borderRadius: 10, padding: 14, gap: 4 },
  betLabel: { opacity: 0.5 },
  betValue: { fontWeight: '700' },
  betEmpty: { opacity: 0.4, fontStyle: 'italic', fontWeight: 'normal' },

  // Standings
  standingsCard: { borderRadius: 10, padding: 14, gap: 8 },
  standingsTitle: { opacity: 0.6, marginBottom: 4 },
  standingsTable: { gap: 3 },
  standingsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  standingsPos: { width: 24, textAlign: 'right', opacity: 0.5, fontVariant: ['tabular-nums'] },
  standingsTeam: { flex: 1 },

  divider: { marginHorizontal: 20, marginVertical: 20 },
  actions: { paddingHorizontal: 20, gap: 10 },
  btnContent: { height: 48 },
});
