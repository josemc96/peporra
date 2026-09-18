import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { List, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';

import { standingsPredictionsApi, StandingsRow } from '@/api/standingsPredictions';
import { colors } from '@/config/theme';

function TeamOrderList({ rows }: { rows: StandingsRow[] }) {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return (
    <View style={styles.teamList}>
      {sorted.map((r) => (
        <View key={r.team} style={styles.teamRow}>
          <Text variant="labelSmall" style={styles.teamPos}>{r.position}</Text>
          <Text variant="bodySmall" style={styles.teamName}>{r.team}</Text>
        </View>
      ))}
    </View>
  );
}

interface MemberEntry {
  userId: string;
  alias: string;
  ida?: StandingsRow[];
  vuelta?: StandingsRow[];
}

export function StandingsPredictionsSection({ groupId, season, isSeasonLocked, isVueltaStarted }: {
  groupId: string; season: string; isSeasonLocked: boolean; isVueltaStarted: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: predictions } = useQuery({
    queryKey: ['group-standings-predictions', groupId, season],
    queryFn: () => standingsPredictionsApi.getGroupPredictions(groupId, season),
    enabled: isSeasonLocked && !!groupId,
  });

  if (!isSeasonLocked) return null;

  const byUser = new Map<string, MemberEntry>();
  (predictions ?? []).forEach((p) => {
    const entry = byUser.get(p.user._id) ?? { userId: p.user._id, alias: p.user.alias };
    if (p.phase === 'ida') entry.ida = p.predictedTable;
    else entry.vuelta = p.predictedTable;
    byUser.set(p.user._id, entry);
  });
  const members = Array.from(byUser.values()).sort((a, b) => a.alias.localeCompare(b.alias));

  if (members.length === 0) return null;

  function toggle(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  return (
    <View style={styles.section}>
      <Text variant="titleSmall" style={styles.title}>Predicciones de la peña</Text>
      <View style={styles.list}>
        {members.map((m) => (
          <List.Accordion
            key={m.userId}
            title={m.alias}
            expanded={!!expanded[m.userId]}
            onPress={() => toggle(m.userId)}
            style={styles.accordion}
            titleStyle={styles.accordionTitle}
          >
            <View style={styles.phaseBlock}>
              <Text variant="labelMedium" style={styles.phaseLabel}>Ida (J19)</Text>
              {m.ida ? (
                <TeamOrderList rows={m.ida} />
              ) : (
                <Text variant="bodySmall" style={styles.noPred}>Sin predicción</Text>
              )}
            </View>
            <View style={styles.phaseBlock}>
              <Text variant="labelMedium" style={styles.phaseLabel}>Vuelta (J38)</Text>
              {!isVueltaStarted ? (
                <Text variant="bodySmall" style={styles.noPred}>Se revela cuando empiece la vuelta (J19)</Text>
              ) : m.vuelta ? (
                <TeamOrderList rows={m.vuelta} />
              ) : (
                <Text variant="bodySmall" style={styles.noPred}>Sin predicción</Text>
              )}
            </View>
          </List.Accordion>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  title: { fontWeight: '700', opacity: 0.7 },
  list: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  accordion: { backgroundColor: colors.surface },
  accordionTitle: { fontWeight: '600' },

  phaseBlock: {
    paddingHorizontal: 16, paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  phaseLabel: { opacity: 0.6, fontWeight: '600', paddingTop: 10, paddingBottom: 4 },
  noPred: { opacity: 0.45, fontStyle: 'italic' },

  teamList: { gap: 2 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  teamPos: { width: 20, textAlign: 'center', opacity: 0.5, fontVariant: ['tabular-nums'] },
  teamName: { flex: 1 },
});
