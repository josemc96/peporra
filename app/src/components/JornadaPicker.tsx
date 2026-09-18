import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Chip, IconButton, Modal, Portal, Text } from 'react-native-paper';

import { colors } from '@/config/theme';

// Botón de calendario que abre una rejilla con todas las jornadas para saltar directo a
// cualquiera de ellas — usado tanto en Predicciones como en el ranking de la Peña.
export function JornadaPicker({ matchdays, selected, onSelect }: {
  matchdays: number[];
  selected: number | null;
  onSelect: (day: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <IconButton
        icon="calendar-month" mode="contained-tonal" size={18}
        iconColor={colors.primary}
        containerColor={colors.primaryDim}
        onPress={() => setVisible(true)}
      />
      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={styles.title}>Ir a jornada</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {matchdays.map((day) => {
              const active = day === selected;
              return (
                <Chip
                  key={day}
                  mode={active ? 'flat' : 'outlined'}
                  selected={active}
                  style={[styles.chip, active && styles.chipActive]}
                  textStyle={active ? styles.chipActiveText : undefined}
                  onPress={() => { setVisible(false); onSelect(day); }}
                >
                  {day}
                </Chip>
              );
            })}
          </ScrollView>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 20,
    padding: 16, maxHeight: '75%',
  },
  title: { fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  chip: { minWidth: 52, alignItems: 'center' },
  chipActive: { backgroundColor: colors.primary },
  chipActiveText: { color: '#fff', fontWeight: '700' },
});
