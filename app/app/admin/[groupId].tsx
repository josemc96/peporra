import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGroupApi, RuleEntry } from '@/api/adminGroup';
import { predictionsApi } from '@/api/predictions';

// ─── Rule row ────────────────────────────────────────────────────────────────

function RuleRow({
  entry,
  onChange,
}: {
  entry: RuleEntry & { _dirty?: boolean };
  onChange: (key: string, patch: { points?: number; active?: boolean }) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleInfo}>
        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{entry.rule.name}</Text>
        <Text variant="bodySmall" style={{ opacity: 0.6 }}>{entry.rule.description}</Text>
      </View>
      <View style={styles.ruleControls}>
        <TextInput
          value={String(entry.points)}
          onChangeText={(v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) onChange(entry.rule.key, { points: n });
          }}
          keyboardType="numeric"
          mode="outlined"
          dense
          style={styles.pointsInput}
          label="pts"
        />
        <Switch
          value={entry.active}
          onValueChange={(v) => onChange(entry.rule.key, { active: v })}
          color={theme.colors.primary}
        />
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AdminPanelScreen() {
  const { groupId, season } = useLocalSearchParams<{ groupId: string; season: string }>();
  const theme = useTheme();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'rules' | 'multipliers'>('rules');

  // ── Rules state ──
  const [localRules, setLocalRules] = useState<(RuleEntry & { _dirty?: boolean })[] | null>(null);
  const [localComps, setLocalComps] = useState<('copa_del_rey' | 'supercopa')[] | null>(null);
  const [rulesSaved, setRulesSaved] = useState(false);

  const { isLoading: settingsLoading, data: settingsData } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, season),
  });

  // Initialise local state once on first load
  if (settingsData && !localRules) {
    setLocalRules(settingsData.rules.map((r) => ({ ...r })));
    setLocalComps(settingsData.enabledCompetitions ?? []);
  }

  const { mutate: saveRules, isPending: savingRules } = useMutation({
    mutationFn: () => {
      const dirtyRules = (localRules ?? []).map((r) => ({
        key: r.rule.key,
        points: r.points,
        active: r.active,
      }));
      return adminGroupApi.updateRuleSettings(groupId, season, dirtyRules, localComps ?? []);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rule-settings', groupId, season] });
      setRulesSaved(true);
    },
  });

  function patchRule(key: string, patch: { points?: number; active?: boolean }) {
    setLocalRules((prev) =>
      (prev ?? []).map((r) => (r.rule.key === key ? { ...r, ...patch } : r))
    );
    setRulesSaved(false);
  }

  function toggleComp(comp: 'copa_del_rey' | 'supercopa') {
    setLocalComps((prev) => {
      const cur = prev ?? [];
      return cur.includes(comp) ? cur.filter((c) => c !== comp) : [...cur, comp];
    });
    setRulesSaved(false);
  }

  // ── Multipliers state ──
  const [newScope, setNewScope] = useState<'match' | 'matchday'>('matchday');
  const [newMatchday, setNewMatchday] = useState('');
  const [newMatchId, setNewMatchId] = useState('');
  const [newValue, setNewValue] = useState('2');

  const { data: multipliers, isLoading: multipliersLoading } = useQuery({
    queryKey: ['multipliers', groupId, season],
    queryFn: () => adminGroupApi.listMultipliers(groupId, season),
    enabled: tab === 'multipliers',
  });

  const { data: matches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
    enabled: tab === 'multipliers' && newScope === 'match',
  });

  const { mutate: createMult, isPending: creatingMult } = useMutation({
    mutationFn: () =>
      adminGroupApi.createMultiplier(groupId, {
        season,
        scope: newScope,
        match: newScope === 'match' ? newMatchId : undefined,
        matchday: newScope === 'matchday' ? parseInt(newMatchday, 10) : undefined,
        multiplier: parseInt(newValue, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['multipliers', groupId, season] });
      setNewMatchday('');
      setNewMatchId('');
      setNewValue('2');
    },
  });

  const { mutate: deleteMult } = useMutation({
    mutationFn: (id: string) => adminGroupApi.deleteMultiplier(groupId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['multipliers', groupId, season] }),
  });

  const canCreateMult =
    parseInt(newValue, 10) >= 1 &&
    (newScope === 'matchday'
      ? parseInt(newMatchday, 10) >= 1 && parseInt(newMatchday, 10) <= 38
      : newMatchId.length > 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Tab selector */}
      <View style={styles.tabRow}>
        <Chip selected={tab === 'rules'} onPress={() => setTab('rules')} style={styles.chip}>
          Reglas
        </Chip>
        <Chip selected={tab === 'multipliers'} onPress={() => setTab('multipliers')} style={styles.chip}>
          Multiplicadores
        </Chip>
      </View>

      {/* ── RULES TAB ── */}
      {tab === 'rules' && (
        <>
          {settingsLoading || !localRules ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>Puntuación de partidos</Text>
              {localRules
                .filter((r) => r.rule.scope === 'match')
                .map((r) => (
                  <RuleRow key={r.rule.key} entry={r} onChange={patchRule} />
                ))}

              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={styles.sectionTitle}>Clasificación</Text>
              {localRules
                .filter((r) => r.rule.scope === 'standings')
                .map((r) => (
                  <RuleRow key={r.rule.key} entry={r} onChange={patchRule} />
                ))}

              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={styles.sectionTitle}>Premios (Pichichi / Zamora)</Text>
              {localRules
                .filter((r) => r.rule.scope === 'award')
                .map((r) => (
                  <RuleRow key={r.rule.key} entry={r} onChange={patchRule} />
                ))}

              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={styles.sectionTitle}>Eliminatorias</Text>
              {localRules
                .filter((r) => r.rule.scope === 'knockout')
                .map((r) => (
                  <RuleRow key={r.rule.key} entry={r} onChange={patchRule} />
                ))}

              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={styles.sectionTitle}>Competiciones activas</Text>
              <View style={styles.compRow}>
                <Chip
                  selected={(localComps ?? []).includes('copa_del_rey')}
                  onPress={() => toggleComp('copa_del_rey')}
                  style={styles.chip}
                >
                  Copa del Rey
                </Chip>
                <Chip
                  selected={(localComps ?? []).includes('supercopa')}
                  onPress={() => toggleComp('supercopa')}
                  style={styles.chip}
                >
                  Supercopa
                </Chip>
              </View>
              <Text variant="labelSmall" style={styles.compNote}>
                Las competiciones desactivadas no generan puntos para tu peña.
              </Text>

              <View style={styles.saveRow}>
                {rulesSaved && (
                  <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                    ✓ Guardado
                  </Text>
                )}
                <Button
                  mode="contained"
                  onPress={() => saveRules()}
                  loading={savingRules}
                  disabled={savingRules}
                  style={{ flex: 1 }}
                >
                  Guardar configuración
                </Button>
              </View>
            </>
          )}
        </>
      )}

      {/* ── MULTIPLIERS TAB ── */}
      {tab === 'multipliers' && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>Añadir multiplicador</Text>

          <View style={styles.tabRow}>
            <Chip selected={newScope === 'matchday'} onPress={() => setNewScope('matchday')} style={styles.chip}>
              Por jornada
            </Chip>
            <Chip selected={newScope === 'match'} onPress={() => setNewScope('match')} style={styles.chip}>
              Por partido
            </Chip>
          </View>

          {newScope === 'matchday' && (
            <TextInput
              label="Jornada (1-38)"
              value={newMatchday}
              onChangeText={setNewMatchday}
              keyboardType="numeric"
              mode="outlined"
              dense
            />
          )}

          {newScope === 'match' && (
            <>
              <Text variant="labelSmall" style={{ opacity: 0.6, marginBottom: 4 }}>
                Selecciona el partido:
              </Text>
              {!matches ? (
                <ActivityIndicator />
              ) : (
                <ScrollView style={styles.matchList} nestedScrollEnabled>
                  {matches.map((m) => (
                    <List.Item
                      key={m._id}
                      title={`${m.homeTeam} vs ${m.awayTeam}`}
                      description={`J${m.matchday ?? '—'} · ${new Date(m.startTime).toLocaleDateString('es-ES')}`}
                      onPress={() => setNewMatchId(m._id)}
                      right={() =>
                        newMatchId === m._id ? (
                          <List.Icon icon="check-circle" color={theme.colors.primary} />
                        ) : null
                      }
                      style={newMatchId === m._id ? { backgroundColor: theme.colors.primaryContainer } : undefined}
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}

          <TextInput
            label="Multiplicador (ej: 2, 3…)"
            value={newValue}
            onChangeText={setNewValue}
            keyboardType="numeric"
            mode="outlined"
            dense
            style={{ marginTop: 8 }}
          />

          <Button
            mode="contained"
            onPress={() => createMult()}
            loading={creatingMult}
            disabled={creatingMult || !canCreateMult}
            style={{ marginTop: 8 }}
          >
            Añadir multiplicador
          </Button>

          <Divider style={styles.divider} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Multiplicadores activos</Text>

          {multipliersLoading && <ActivityIndicator />}
          {multipliers?.length === 0 && (
            <Text style={{ opacity: 0.5 }}>Sin multiplicadores configurados.</Text>
          )}
          {multipliers?.map((m) => (
            <List.Item
              key={m._id}
              title={
                m.scope === 'matchday'
                  ? `×${m.multiplier} — Jornada ${m.matchday}`
                  : `×${m.multiplier} — Partido específico`
              }
              description={`Temporada ${m.season}`}
              right={() => (
                <IconButton icon="delete" onPress={() => deleteMult(m._id)} />
              )}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1 },
  sectionTitle: { fontWeight: '600', marginTop: 4 },
  divider: { marginVertical: 8 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  ruleInfo: { flex: 1 },
  ruleControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointsInput: { width: 64 },
  compRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  compNote: { opacity: 0.5, marginTop: 4 },
  saveRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  matchList: { maxHeight: 200, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
});
