import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, Surface, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { useCurrentGroup } from '@/context/CurrentGroupContext';
import { rankingApi } from '@/api/ranking';

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

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { group } = useCurrentGroup();
  const theme = useTheme();

  const { data: ranking } = useQuery({
    queryKey: ['ranking', group?.id, group?.season],
    queryFn: () => rankingApi.get(group!.id, group!.season),
    enabled: !!group,
    staleTime: 5 * 60 * 1000,
  });

  const myStats = useMemo(() => {
    if (!ranking || !user) return null;
    const pos = ranking.findIndex((e) => e.user.id === user.id);
    if (pos === -1) return null;
    const entry = ranking[pos];
    return { points: entry.points, exactScores: entry.exactScores, position: pos + 1, total: ranking.length };
  }, [ranking, user]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (!user) return null;

  const color = avatarColor(user.alias);
  const initials = user.alias.slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: color + '18' }]}>
        <Avatar.Text
          size={80}
          label={initials}
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

      {/* Stats de temporada (solo si está en una peña) */}
      {group && (
        <View style={styles.statsSection}>
          <Text variant="labelMedium" style={styles.sectionLabel}>
            {group.name} · {group.season}
          </Text>
          <View style={styles.statsRow}>
            <StatCard value={myStats?.points ?? '—'} label="Puntos" />
            <StatCard value={myStats?.exactScores ?? '—'} label="Exactos" />
            <StatCard
              value={myStats ? `${myStats.position}/${myStats.total}` : '—'}
              label="Posición"
            />
          </View>
        </View>
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

  hero: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  alias: { fontWeight: '700', marginTop: 4 },
  email: { opacity: 0.55 },
  adminBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 2,
  },

  statsSection: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  sectionLabel: { opacity: 0.5, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 16, gap: 4,
  },
  statValue: { fontWeight: '700' },
  statLabel: { opacity: 0.55 },

  divider: { marginHorizontal: 20, marginTop: 24, marginBottom: 16 },

  actions: { paddingHorizontal: 20, gap: 10 },
  btnContent: { height: 48 },
});
