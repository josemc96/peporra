import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, IconButton, Surface, Text } from 'react-native-paper';

import { colors } from '@/config/theme';

const MEDAL_COLORS = ['#FFBE0B', '#C0C0C0', '#CD7F32'];

// Fila de jugador del ranking de una peña — siempre trae los 4 datos (puntos jornada/total,
// deuda jornada/total): el par que toca según la vista activa se muestra grande, el otro
// par queda pequeño/apagado debajo. Usada tanto en la vista de Peña como en la vista de una
// jornada concreta dentro de Predicciones.
export function PlayerRow({
  alias, isMe, position, exactScores,
  rankingView, matchday,
  seasonPoints, matchdayPoints, seasonDebt, matchdayDebt,
  onPress, onKick,
}: {
  alias: string; isMe: boolean; position: number; exactScores: number;
  rankingView: 'matchday' | 'season'; matchday: number;
  seasonPoints: number; matchdayPoints: number; seasonDebt: number; matchdayDebt: number;
  onPress: () => void; onKick?: () => void;
}) {
  const medalColor = position <= 3 ? MEDAL_COLORS[position - 1] : undefined;
  const isMatchday = rankingView === 'matchday';

  const primaryPoints = isMatchday ? matchdayPoints : seasonPoints;
  const secondaryPointsLabel = isMatchday
    ? `${seasonPoints} pts temporada`
    : `${matchdayPoints} pts en J${matchday}`;

  const primaryDebt = isMatchday ? matchdayDebt : seasonDebt;
  const secondaryDebt = isMatchday ? seasonDebt : matchdayDebt;
  const secondaryDebtLabel = isMatchday ? `${seasonDebt}€ en total` : `${matchdayDebt}€ en J${matchday}`;

  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#0001' }}>
      <Surface style={[styles.row, isMe && styles.rowMe]} elevation={isMe ? 2 : 1}>
        <View style={[styles.posBox, medalColor ? { backgroundColor: medalColor } : styles.posBoxDefault]}>
          <Text variant="titleMedium" style={styles.posText}>{position}</Text>
        </View>
        <Avatar.Text size={36} label={(alias ?? '?').slice(0, 2).toUpperCase()} style={styles.avatar} />
        <View style={styles.userInfo}>
          <Text variant="bodyLarge" style={[styles.alias, isMe && styles.aliasMe]}>
            {alias ?? '?'}{isMe ? '  (tú)' : ''}
          </Text>
          {exactScores > 0 && (
            <Text variant="labelSmall" style={styles.exactLabel}>
              {exactScores} exacto{exactScores !== 1 ? 's' : ''} en la temporada
            </Text>
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
        {onKick && (
          <IconButton icon="account-remove" size={20} onPress={(e) => { e.stopPropagation?.(); onKick(); }} />
        )}
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  rightCol: { alignItems: 'flex-end', gap: 0 },
  pointsPrimary: { fontWeight: '700' },
  pointsSecondary: { opacity: 0.45, marginBottom: 2 },
  debtPrimary: { color: colors.debt, fontWeight: '700' },
  debtSecondary: { opacity: 0.45, color: colors.debt },
});
