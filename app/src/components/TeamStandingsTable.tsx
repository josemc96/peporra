import { FlatList, Image, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Surface, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';

import { standingsTableApi, StandingsRow } from '@/api/standingsTable';
import { colors } from '@/config/theme';

function TableRow({ row }: { row: StandingsRow }) {
  const diffColor = row.goalDifference > 0 ? colors.green : row.goalDifference < 0 ? colors.error : colors.text2;
  const diffText = row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference);

  return (
    <Surface style={styles.row} elevation={1}>
      <View style={styles.posBox}>
        <Text variant="labelLarge" style={styles.posText}>{row.position}</Text>
      </View>
      {row.crest ? <Image source={{ uri: row.crest }} style={styles.crest} /> : <View style={styles.crest} />}
      <Text variant="bodyMedium" style={styles.teamName} numberOfLines={1}>{row.team}</Text>
      <Text variant="labelMedium" style={styles.stat}>{row.played}</Text>
      <Text variant="labelMedium" style={[styles.stat, { color: diffColor }]}>{diffText}</Text>
      <Text variant="titleSmall" style={styles.points}>{row.points}</Text>
    </Surface>
  );
}

// Tabla real de La Liga en vivo — usada tanto en la pestaña "Equipos" de la Peña como en la
// pantalla standings-table/[season].
export function TeamStandingsTable({ season }: { season: string }) {
  const { data: table, isLoading } = useQuery({
    queryKey: ['standings-table', season],
    queryFn: () => standingsTableApi.getCurrent(season),
    enabled: !!season,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.posBox} />
        <View style={styles.crest} />
        <Text variant="labelSmall" style={[styles.teamName, styles.headerLabel]}>Equipo</Text>
        <Text variant="labelSmall" style={[styles.stat, styles.headerLabel]}>PJ</Text>
        <Text variant="labelSmall" style={[styles.stat, styles.headerLabel]}>DG</Text>
        <Text variant="labelSmall" style={[styles.points, styles.headerLabel]}>Pts</Text>
      </View>
      <FlatList
        data={table}
        keyExtractor={(row) => row.team}
        renderItem={({ item }) => <TableRow row={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Todavía no hay partidos jugados esta temporada.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    // 22 = padding de la lista (12) + padding interno de cada fila (10), para que las
    // columnas del header queden alineadas con los valores de las filas de abajo.
    paddingHorizontal: 22, paddingTop: 10, paddingBottom: 6,
  },
  headerLabel: { opacity: 0.5 },
  list: { padding: 12, paddingTop: 4, gap: 6, paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, padding: 10,
  },
  posBox: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: colors.surfaceHigh,
    justifyContent: 'center', alignItems: 'center',
  },
  posText: { fontWeight: '700' },
  crest: { width: 22, height: 22 },
  teamName: { flex: 1 },
  stat: { width: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  points: { width: 32, textAlign: 'center', fontWeight: '700' },
  empty: { textAlign: 'center', opacity: 0.5, marginTop: 32, fontStyle: 'italic' },
});
