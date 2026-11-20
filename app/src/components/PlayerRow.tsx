import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, IconButton, Surface, Text } from 'react-native-paper';

import { colors } from '@/config/theme';
import { CardNote, MatchBreakdown } from '@/api/penalties';

const MEDAL_COLORS = ['#FFBE0B', '#C0C0C0', '#CD7F32'];
const DEBT_BORDER_COLOR = '#EF4444';

function scoreLabel(home: number | null, away: number | null): string {
  return home != null && away != null ? `${home}-${away}` : 'sin predicción';
}

// Un partido del desplegable de aciertos/fallos — la predicción del jugador seleccionado,
// y debajo (si no eres tú mismo) la tuya propia para el mismo partido, para comparar.
function MatchBreakdownRow({ match, mine }: { match: MatchBreakdown; mine?: MatchBreakdown }) {
  const finished = match.homeScore != null;
  return (
    <View style={styles.breakdownMatch}>
      <View style={styles.breakdownHeader}>
        <View style={styles.breakdownTeamsRow}>
          {match.homeCrest ? <Image source={{ uri: match.homeCrest }} style={styles.breakdownCrest} /> : null}
          <Text variant="labelSmall" style={styles.breakdownTeamName} numberOfLines={1}>{match.homeTeam}</Text>
          <Text variant="labelSmall" style={styles.breakdownVs}>vs</Text>
          {match.awayCrest ? <Image source={{ uri: match.awayCrest }} style={styles.breakdownCrest} /> : null}
          <Text variant="labelSmall" style={styles.breakdownTeamName} numberOfLines={1}>{match.awayTeam}</Text>
        </View>
        <Text variant="labelSmall" style={styles.breakdownRealScore}>
          {finished ? `${match.homeScore}-${match.awayScore}` : 'pendiente'}
        </Text>
      </View>
      <Text variant="labelSmall" style={[styles.breakdownPred, finished && (match.isExact ? styles.breakdownHit : styles.breakdownMiss)]}>
        {finished ? (match.isExact ? '✓' : '✗') : '·'} {scoreLabel(match.predictedHome, match.predictedAway)}
      </Text>
      {mine && (
        <Text variant="labelSmall" style={[styles.breakdownPred, styles.breakdownMine, finished && (mine.isExact ? styles.breakdownHit : styles.breakdownMiss)]}>
          {finished ? (mine.isExact ? '✓' : '✗') : '·'} Tú: {scoreLabel(mine.predictedHome, mine.predictedAway)}
        </Text>
      )}
    </View>
  );
}

// Fila de jugador del ranking de una peña — siempre trae los 4 datos (puntos jornada/total,
// deuda jornada/total): el par que toca según la vista activa se muestra grande, el otro
// par queda pequeño/apagado debajo. Usada tanto en la vista de Peña como en la vista de una
// jornada concreta dentro de Predicciones.
export function PlayerRow({
  alias, isMe, position, exactScores,
  rankingView, matchday,
  seasonPoints, matchdayPoints, seasonDebt, matchdayDebt,
  cardNotes, matches, myMatches,
  onPress, onKick,
}: {
  alias: string; isMe: boolean; position: number; exactScores: number;
  rankingView: 'matchday' | 'season'; matchday: number;
  seasonPoints: number; matchdayPoints: number; seasonDebt: number; matchdayDebt: number;
  cardNotes?: CardNote[]; matches?: MatchBreakdown[]; myMatches?: MatchBreakdown[];
  onPress: () => void; onKick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;
  const isMatchday = rankingView === 'matchday';
  const myMatchById = new Map((myMatches ?? []).map((m) => [m.matchId, m]));

  const primaryPoints = isMatchday ? matchdayPoints : seasonPoints;
  const secondaryPointsLabel = isMatchday
    ? `${seasonPoints} pts temporada`
    : `${matchdayPoints} pts en J${matchday}`;

  const primaryDebt = isMatchday ? matchdayDebt : seasonDebt;
  const secondaryDebt = isMatchday ? seasonDebt : matchdayDebt;
  const secondaryDebtLabel = isMatchday ? `${seasonDebt}€ en total` : `${matchdayDebt}€ en J${matchday}`;

  const hasBreakdown = isMatchday && !!matches && matches.length > 0;

  // Solo en el ranking de jornada: sin número de posición, el avatar lleva un borde de
  // medalla (oro/plata/bronce) o, si no está en el podio pero paga al terminar la jornada,
  // un borde rojo — en vez de competir por ancho con el nombre, la posición se ve en el borde.
  const avatarBorderColor = isMatchday
    ? (medalColor ?? (matchdayDebt > 0 ? DEBT_BORDER_COLOR : undefined))
    : undefined;

  return (
    <View>
    <Pressable onPress={onPress} android_ripple={{ color: '#0001' }}>
      <Surface style={[styles.row, isMe && styles.rowMe]} elevation={isMe ? 2 : 1}>
        {!isMatchday && (
          <View style={styles.posAvatarCol}>
            <View style={[styles.posBox, medalColor ? { backgroundColor: medalColor } : styles.posBoxDefault]}>
              <Text variant="labelSmall" style={styles.posText}>{position}</Text>
            </View>
            <Avatar.Text size={26} label={(alias ?? '?').slice(0, 2).toUpperCase()} style={styles.avatar} />
          </View>
        )}
        <View style={styles.userInfo}>
          {isMatchday ? (
            <View style={styles.matchdayHeaderRow}>
              <Avatar.Text
                size={28}
                label={(alias ?? '?').slice(0, 2).toUpperCase()}
                style={[styles.avatar, avatarBorderColor && { borderWidth: 2, borderColor: avatarBorderColor }]}
              />
              <Text variant="bodyLarge" style={[styles.alias, styles.aliasShrink, isMe && styles.aliasMe]} numberOfLines={1}>
                {alias ?? '?'}{isMe ? '  (tú)' : ''}
              </Text>
            </View>
          ) : (
            <Text variant="bodyLarge" style={[styles.alias, isMe && styles.aliasMe]} numberOfLines={1}>
              {alias ?? '?'}{isMe ? '  (tú)' : ''}
            </Text>
          )}
          {exactScores > 0 && (
            <Text variant="labelSmall" style={styles.exactLabel} numberOfLines={1}>
              {exactScores} exacto{exactScores !== 1 ? 's' : ''} en la temporada
            </Text>
          )}
          {isMatchday && cardNotes && cardNotes.length > 0 && (
            <View style={styles.cardNotes}>
              {cardNotes.map((note, i) => (
                <Text
                  key={i}
                  variant="labelSmall"
                  numberOfLines={1}
                  style={[
                    styles.cardNoteText,
                    note.delta != null && note.delta > 0 && styles.cardNoteUp,
                    note.delta != null && note.delta < 0 && styles.cardNoteDown,
                  ]}
                >
                  {note.icon} {note.text}{note.delta != null ? ` (${note.delta > 0 ? '+' : ''}${note.delta})` : ''}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View style={styles.rightCol}>
          <Text variant="titleMedium" style={[styles.pointsPrimary, medalColor ? { color: medalColor } : undefined]}>
            {primaryPoints} pts
          </Text>
          <Text variant="labelSmall" style={styles.pointsSecondary}>{secondaryPointsLabel}</Text>
          {primaryDebt > 0 ? (
            <>
              <Text variant="labelMedium" style={styles.debtPrimary}>💸 {primaryDebt}€</Text>
              {secondaryDebt > 0 && (
                <Text variant="labelSmall" style={styles.debtSecondary}>{secondaryDebtLabel}</Text>
              )}
            </>
          ) : secondaryDebt > 0 && (
            // No debe nada de la vista activa (ej. no perdió esta jornada), pero sí en la
            // otra — se muestra igual que la línea secundaria de quien sí debe (pequeña,
            // apagada), para no parecer que no debe nada en total.
            <Text variant="labelSmall" style={styles.debtSecondary}>{secondaryDebtLabel}</Text>
          )}
        </View>
        {hasBreakdown && (
          <IconButton
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            style={styles.smallIconBtn}
            onPress={(e) => { e.stopPropagation?.(); setExpanded(!expanded); }}
          />
        )}
        {onKick && (
          <IconButton icon="account-remove" size={18} style={styles.smallIconBtn} onPress={(e) => { e.stopPropagation?.(); onKick(); }} />
        )}
      </Surface>
    </Pressable>
    {expanded && hasBreakdown && (
      <View style={styles.breakdownPanel}>
        <Text variant="labelMedium" style={styles.breakdownTitle}>
          Partidos de {alias} en J{matchday}
        </Text>
        {matches!.map((m) => (
          <MatchBreakdownRow key={m.matchId} match={m} mine={!isMe ? myMatchById.get(m.matchId) : undefined} />
        ))}
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, gap: 6 },
  rowMe: { borderWidth: 1.5, borderColor: '#C04A1A' },
  posAvatarCol: { alignItems: 'center', gap: 2 },
  posBox: { width: 20, height: 16, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  posBoxDefault: { backgroundColor: '#1C2236' },
  posText: { fontWeight: '700', color: '#E8EAF2' },
  avatar: { backgroundColor: '#232B42' },
  matchdayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aliasShrink: { flex: 1, minWidth: 0 },
  userInfo: { flex: 1, minWidth: 0 },
  smallIconBtn: { width: 28, height: 28, margin: 0 },
  alias: { fontWeight: '500' },
  aliasMe: { color: '#C04A1A', fontWeight: '700' },
  exactLabel: { opacity: 0.5, marginTop: 1 },
  cardNotes: { marginTop: 2, gap: 1 },
  cardNoteText: { opacity: 0.7 },
  cardNoteUp: { color: '#22C55E', opacity: 1 },
  cardNoteDown: { color: '#EF4444', opacity: 1 },
  rightCol: { alignItems: 'flex-end', gap: 0 },
  breakdownPanel: {
    marginTop: 4, padding: 10, borderRadius: 10, gap: 8,
    backgroundColor: '#1A1F35',
  },
  breakdownTitle: { opacity: 0.6, marginBottom: 2 },
  breakdownMatch: { gap: 2 },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  breakdownTeamsRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3 },
  breakdownCrest: { width: 14, height: 14 },
  breakdownTeamName: { flexShrink: 1, opacity: 0.85 },
  breakdownVs: { opacity: 0.5 },
  breakdownRealScore: { fontWeight: '700', opacity: 0.85 },
  breakdownPred: { opacity: 0.7 },
  breakdownMine: { opacity: 0.6 },
  breakdownHit: { color: '#22C55E', opacity: 1 },
  breakdownMiss: { color: '#EF4444', opacity: 1 },
  pointsPrimary: { fontWeight: '700' },
  pointsSecondary: { opacity: 0.45, marginBottom: 2 },
  debtPrimary: { color: colors.debt, fontWeight: '700' },
  debtSecondary: { opacity: 0.45, color: colors.debt },
});
