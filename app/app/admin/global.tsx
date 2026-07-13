import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGlobalApi, Award } from '@/api/adminGlobal';
import { useAuth } from '@/context/AuthContext';

// ─── Award result section ───────────────────────────────────────────────────

function AwardResultSection({ season }: { season: string }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [award, setAward] = useState<Award>('pichichi');
  const [playerInput, setPlayerInput] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: results, isLoading } = useQuery({
    queryKey: ['award-results-admin', season],
    queryFn: () => adminGlobalApi.getAwardResults(season),
  });

  const current = results?.find((r) => r.award === award);

  const { mutate: save, isPending: saving, error } = useMutation({
    mutationFn: () => adminGlobalApi.setAwardResult(season, award, playerInput.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['award-results-admin', season] });
      qc.invalidateQueries({ queryKey: ['award-results'] });
      setSaved(true);
    },
  });

  function handleTabChange(a: Award) {
    setAward(a);
    setPlayerInput('');
    setSaved(false);
  }

  return (
    <>
      <Text variant="titleMedium" style={styles.sectionTitle}>Resultado real de premios</Text>
      <Text variant="bodySmall" style={styles.sectionNote}>
        Introduce el ganador real al terminar la temporada para que se calculen los puntos de Pichichi/Zamora.
      </Text>

      <View style={styles.tabRow}>
        <Chip selected={award === 'pichichi'} onPress={() => handleTabChange('pichichi')} style={{ flex: 1 }}>
          🏆 Pichichi
        </Chip>
        <Chip selected={award === 'zamora'} onPress={() => handleTabChange('zamora')} style={{ flex: 1 }}>
          🧤 Zamora
        </Chip>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : (
        <>
          {current && (
            <Text variant="bodySmall" style={styles.currentValue}>
              Guardado actualmente: <Text style={{ fontWeight: '700' }}>{current.realPlayer}</Text>
            </Text>
          )}
          <TextInput
            label={award === 'pichichi' ? 'Máximo goleador real' : 'Portero menos goleado real'}
            value={playerInput}
            placeholder={current?.realPlayer ?? ''}
            onChangeText={(t) => { setPlayerInput(t); setSaved(false); }}
            mode="outlined"
            dense
            autoCorrect={false}
          />
          {error && (
            <Text variant="labelSmall" style={{ color: theme.colors.error }}>
              {(error as Error).message}
            </Text>
          )}
          {saved && (
            <Text variant="labelSmall" style={{ color: theme.colors.primary }}>✓ Guardado</Text>
          )}
          <Button
            mode="contained"
            onPress={() => save()}
            loading={saving}
            disabled={saving || playerInput.trim().length === 0}
          >
            Guardar resultado
          </Button>
        </>
      )}
    </>
  );
}

// ─── Action button ──────────────────────────────────────────────────────────

function ActionButton({
  label,
  description,
  icon,
  mutationFn,
}: {
  label: string;
  description: string;
  icon: string;
  mutationFn: () => Promise<{ message: string }>;
}) {
  const theme = useTheme();
  const [done, setDone] = useState(false);

  const { mutate, isPending, error } = useMutation({
    mutationFn,
    onSuccess: () => { setDone(true); setTimeout(() => setDone(false), 4000); },
  });

  return (
    <View style={styles.actionBlock}>
      <View style={styles.actionInfo}>
        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{label}</Text>
        <Text variant="bodySmall" style={{ opacity: 0.6 }}>{description}</Text>
        {error && (
          <Text variant="labelSmall" style={{ color: theme.colors.error }}>
            {(error as Error).message}
          </Text>
        )}
        {done && (
          <Text variant="labelSmall" style={{ color: theme.colors.primary }}>✓ Completado</Text>
        )}
      </View>
      <Button mode="contained-tonal" icon={icon} loading={isPending} disabled={isPending} onPress={() => mutate()}>
        Ejecutar
      </Button>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function GlobalAdminScreen() {
  const { user } = useAuth();
  const [season, setSeason] = useState('2026-2027');
  const [seasonInput, setSeasonInput] = useState('2026-2027');

  if (user?.role !== 'admin') {
    return (
      <View style={styles.centered}>
        <Text variant="bodyLarge">Sin acceso</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <View style={styles.seasonRow}>
        <TextInput
          label="Temporada"
          value={seasonInput}
          onChangeText={setSeasonInput}
          mode="outlined"
          dense
          style={{ flex: 1 }}
          placeholder="2026-2027"
        />
        <Button
          mode="contained-tonal"
          onPress={() => setSeason(seasonInput.trim())}
          disabled={seasonInput.trim() === season || seasonInput.trim().length === 0}
        >
          Aplicar
        </Button>
      </View>
      <Text variant="labelSmall" style={styles.sectionNote}>Temporada activa: {season}</Text>

      <Divider style={styles.divider} />

      <AwardResultSection season={season} />

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={styles.sectionTitle}>Operaciones</Text>

      <ActionButton
        label="Calcular puntos"
        description="Procesa todas las predicciones pendientes de partidos terminados y genera puntuaciones."
        icon="calculator"
        mutationFn={adminGlobalApi.calculateScores}
      />
      <ActionButton
        label="Sincronizar partidos"
        description="Fuerza una sincronización con football-data.org ahora, sin esperar al cron de 10 min."
        icon="sync"
        mutationFn={adminGlobalApi.syncMatches}
      />
      <ActionButton
        label="Sincronizar goleadores"
        description="Actualiza la clasificación de goleadores de La Liga desde football-data.org."
        icon="run-fast"
        mutationFn={adminGlobalApi.syncScorers}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontWeight: '700' },
  sectionNote: { opacity: 0.6 },
  tabRow: { flexDirection: 'row', gap: 8 },
  currentValue: { opacity: 0.7 },
  divider: { marginVertical: 8 },
  actionBlock: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionInfo: { flex: 1, gap: 2 },
  seasonRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
