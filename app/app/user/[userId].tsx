import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Divider, Surface, Text, useTheme } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { awardPredictionsApi } from '@/api/awardPredictions';
import { adminGroupApi } from '@/api/adminGroup';
import { apiFetch } from '@/api/client';

const AVATAR_COLORS = [
  '#1565C0', '#2E7D32', '#6A1B9A', '#AD1457',
  '#00695C', '#E65100', '#283593', '#4527A0',
];

function avatarColor(alias: string): string {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) hash = alias.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  const theme = useTheme();
  return (
    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
      <Text variant="headlineMedium" style={styles.statValue}>{value}</Text>
      <Text variant="labelSmall" style={styles.statLabel}>{label}</Text>
    </Surface>
  );
}

export default function UserProfileScreen() {
  const {
    userId, alias,
    points, exactScores, position, total,
    groupId, season,
  } = useLocalSearchParams<{
    userId: string; alias: string;
    points: string; exactScores: string; position: string; total: string;
    groupId: string; season: string;
  }>();

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
  const feats = settings?.enabledFeatures ?? [];
  const hasPichichi = feats.includes('pichichi');
  const hasZamora = feats.includes('zamora');

  // Apuestas del grupo → filtramos por este usuario
  const { data: groupPichichi } = useQuery({
    queryKey: ['group-award-predictions', groupId, season, 'pichichi'],
    queryFn: () => awardPredictionsApi.getGroupPredictions(groupId, season, 'pichichi'),
    enabled: isSeasonLocked && hasPichichi && !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: groupZamora } = useQuery({
    queryKey: ['group-award-predictions', groupId, season, 'zamora'],
    queryFn: () => awardPredictionsApi.getGroupPredictions(groupId, season, 'zamora'),
    enabled: isSeasonLocked && hasZamora && !!groupId,
    staleTime: 5 * 60 * 1000,
  });

  const pichichi = useMemo(
    () => groupPichichi?.find((p) => p.user._id === userId),
    [groupPichichi, userId]
  );
  const zamora = useMemo(
    () => groupZamora?.find((p) => p.user._id === userId),
    [groupZamora, userId]
  );

  const showBets = isSeasonLocked && (hasPichichi || hasZamora);

  const color = avatarColor(alias ?? '?');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: color + '18' }]}>
        <Avatar.Text
          size={80}
          label={(alias ?? '?').slice(0, 2).toUpperCase()}
          style={{ backgroundColor: color }}
          labelStyle={{ color: '#fff', fontWeight: '700', fontSize: 28 }}
        />
        <Text variant="headlineSmall" style={styles.alias}>{alias}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <View style={styles.statsRow}>
          <StatCard value={points ?? '—'} label="Puntos" />
          <StatCard value={exactScores ?? '—'} label="Exactos" />
          <StatCard value={position && total ? `${position}/${total}` : '—'} label="Posición" />
        </View>
      </View>

      {/* Apuestas de temporada */}
      {showBets && (pichichi || zamora) && (
        <>
          <Divider style={styles.divider} />
          <View style={styles.betsSection}>
            <Text variant="titleSmall" style={styles.betsTitle}>Apuestas de temporada</Text>

            {hasPichichi && (
              <Surface style={styles.betCard} elevation={1}>
                <Text variant="labelSmall" style={styles.betLabel}>Pichichi</Text>
                <Text variant="titleMedium" style={styles.betValue}>
                  {pichichi?.predictedPlayer ?? (
                    <Text style={styles.betEmpty}>Sin predicción</Text>
                  )}
                </Text>
              </Surface>
            )}

            {hasZamora && (
              <Surface style={styles.betCard} elevation={1}>
                <Text variant="labelSmall" style={styles.betLabel}>Zamora</Text>
                <Text variant="titleMedium" style={styles.betValue}>
                  {zamora?.predictedPlayer ?? (
                    <Text style={styles.betEmpty}>Sin predicción</Text>
                  )}
                </Text>
              </Surface>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flexGrow: 1, paddingBottom: 40 },

  hero: { alignItems: 'center', gap: 8, paddingVertical: 36, paddingHorizontal: 24 },
  alias: { fontWeight: '700', marginTop: 4 },

  statsSection: { paddingHorizontal: 20, paddingTop: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 16, gap: 4 },
  statValue: { fontWeight: '700' },
  statLabel: { opacity: 0.55 },

  divider: { marginHorizontal: 20, marginVertical: 20 },

  betsSection: { paddingHorizontal: 20, gap: 12 },
  betsTitle: { fontWeight: '700', opacity: 0.7 },
  betCard: { borderRadius: 10, padding: 14, gap: 4 },
  betLabel: { opacity: 0.5 },
  betValue: { fontWeight: '700' },
  betEmpty: { opacity: 0.4, fontStyle: 'italic', fontWeight: 'normal' },
});
