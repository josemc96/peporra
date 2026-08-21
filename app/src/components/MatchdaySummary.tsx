import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Chip, List, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';

import { matchdaySummaryApi, MatchdaySummaryGroup } from '@/api/matchdaySummary';
import { CARD_EMOJI, CARD_LABELS } from '@/api/cards';
import { colors } from '@/config/theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function MatchRow({ match }: { match: MatchdaySummaryGroup['matches'][number] }) {
  return (
    <View style={styles.matchRow}>
      <View style={styles.matchTeams}>
        <View style={styles.matchTeamCell}>
          {match.homeCrest ? <Image source={{ uri: match.homeCrest }} style={styles.crest} /> : null}
          <Text variant="bodySmall" style={styles.matchTeam} numberOfLines={1}>{match.homeTeam}</Text>
        </View>
        <Text variant="labelMedium" style={styles.matchScore}>{match.homeScore} - {match.awayScore}</Text>
        <View style={[styles.matchTeamCell, styles.matchTeamCellRight]}>
          <Text variant="bodySmall" style={[styles.matchTeam, styles.matchTeamRight]} numberOfLines={1}>{match.awayTeam}</Text>
          {match.awayCrest ? <Image source={{ uri: match.awayCrest }} style={styles.crest} /> : null}
        </View>
      </View>
      <View style={styles.matchFooter}>
        <Text variant="labelSmall" style={styles.matchDate}>{formatDate(match.startTime)}</Text>
        <View style={styles.matchFooterRight}>
          <Chip
            compact
            style={[styles.chip, { backgroundColor: match.isExact ? colors.goldDim : colors.greenDim }]}
            textStyle={[styles.chipText, { color: match.isExact ? colors.gold : colors.green }]}
          >
            {match.isExact ? 'Exacto' : 'Acierto'}
          </Chip>
          <Text variant="labelMedium" style={[styles.matchPoints, { color: match.points > 0 ? colors.green : colors.error }]}>
            {match.points > 0 ? '+' : ''}{match.points} pts
          </Text>
        </View>
      </View>
      {match.cardImpact && (
        <CardImpactNote impact={match.cardImpact} before={match.preCardPoints} after={match.points} />
      )}
    </View>
  );
}

function CardImpactNote({ impact, before, after }: {
  impact: NonNullable<MatchdaySummaryGroup['matches'][number]['cardImpact']>;
  before: number; after: number;
}) {
  const hurt = after < before;
  const color = hurt ? colors.error : colors.gold;
  const who = impact.byAlias ? `${impact.byAlias} te jugó` : 'Jugaste';
  return (
    <View style={[styles.cardImpact, { backgroundColor: hurt ? colors.errorDim : colors.goldDim }]}>
      <Text variant="labelSmall" style={[styles.cardImpactText, { color }]}>
        {CARD_EMOJI[impact.card]} {who} {CARD_LABELS[impact.card]}: {before} → {after} pts
      </Text>
    </View>
  );
}

export function MatchdaySummarySection({ groupId, userId, season }: {
  groupId: string; userId: string; season: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data } = useQuery({
    queryKey: ['matchday-summary', groupId, userId, season],
    queryFn: () => matchdaySummaryApi.get(groupId, userId, season),
    enabled: !!groupId && !!userId && !!season,
    staleTime: 5 * 60 * 1000,
  });

  const groups = data?.groups ?? [];
  if (groups.length === 0) return null;

  function toggle(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  return (
    <View style={styles.section}>
      <Text variant="titleSmall" style={styles.title}>Jornadas jugadas</Text>
      <View style={styles.list}>
        {groups.map((group) => (
          <List.Accordion
            key={group.key}
            title={group.label}
            description={`${group.totalPoints} pts`}
            expanded={!!expanded[group.key]}
            onPress={() => toggle(group.key)}
            style={styles.accordion}
            titleStyle={styles.accordionTitle}
            descriptionStyle={styles.accordionDescription}
          >
            {group.matches.length === 0 ? (
              <Text variant="bodySmall" style={styles.noHits}>Sin aciertos esta jornada</Text>
            ) : (
              group.matches.map((match) => <MatchRow key={match.matchId} match={match} />)
            )}
          </List.Accordion>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  title: { fontWeight: '700', opacity: 0.7 },
  list: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  accordion: { backgroundColor: colors.surface },
  accordionTitle: { fontWeight: '600' },
  accordionDescription: { opacity: 0.6 },

  noHits: { opacity: 0.45, fontStyle: 'italic', paddingHorizontal: 16, paddingBottom: 14 },

  matchRow: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  matchTeams: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchTeamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchTeamCellRight: { justifyContent: 'flex-end' },
  crest: { width: 18, height: 18 },
  matchTeam: { flexShrink: 1 },
  matchTeamRight: { textAlign: 'right' },
  matchScore: { fontWeight: '700', minWidth: 44, textAlign: 'center' },

  matchFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchDate: { opacity: 0.45 },
  matchFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { height: 24 },
  chipText: { fontWeight: '700', fontSize: 11, lineHeight: 14 },
  matchPoints: { fontWeight: '700' },

  cardImpact: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  cardImpactText: { fontWeight: '600' },
});
