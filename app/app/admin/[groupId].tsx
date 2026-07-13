import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  Surface,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGroupApi, RuleEntry, GroupFeature } from '@/api/adminGroup';
import { adminMatchesApi } from '@/api/adminMatches';
import { predictionsApi, Match } from '@/api/predictions';
import { penaltiesApi, PenaltyEntry } from '@/api/penalties';
import { manualAdjustmentsApi, ManualAdjustment } from '@/api/manualAdjustments';
import { groupsApi, GroupMember } from '@/api/groups';
import { rankingApi } from '@/api/ranking';
import { useAuth } from '@/context/AuthContext';

// ─── Rule row ──────────────────────────────────────────────────────────────

function RuleRow({
  entry,
  onChange,
}: {
  entry: RuleEntry;
  onChange: (key: string, patch: { points?: number; active?: boolean }) => void;
}) {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleInfo}>
        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{entry.rule.name}</Text>
        <Text variant="bodySmall" style={{ opacity: 0.6 }}>{entry.rule.description}</Text>
      </View>
      <View style={styles.ruleControls}>
        <TextInput
          value={String(entry.points)}
          onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) onChange(entry.rule.key, { points: n }); }}
          keyboardType="numeric"
          mode="outlined"
          dense
          style={styles.pointsInput}
          label="pts"
        />
        <Switch value={entry.active} onValueChange={(v) => onChange(entry.rule.key, { active: v })} />
      </View>
    </View>
  );
}

// ─── Match admin card ───────────────────────────────────────────────────────

function MatchAdminCard({ match, season }: { match: Match; season: string }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [showResultForm, setShowResultForm] = useState(false);

  const { mutate: saveResult, isPending: savingResult } = useMutation({
    mutationFn: () => adminMatchesApi.setResult(match._id, parseInt(homeScore), parseInt(awayScore)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knockout-admin-matches', season] }); setShowResultForm(false); },
  });

  const { mutate: saveQualifier, isPending: savingQualifier } = useMutation({
    mutationFn: (q: 'home' | 'away') => adminMatchesApi.setQualifier(match._id, q),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knockout-admin-matches', season] }),
  });

  const isFinished = match.status === 'finished';
  const isDraw = isFinished && match.homeScore === match.awayScore;
  const needsQualifier = isDraw && !match.realQualifier;
  const competitionLabel = match.competition === 'copa_del_rey' ? 'Copa del Rey' : 'Supercopa';

  return (
    <Surface style={styles.matchCard} elevation={2}>
      <Text variant="labelSmall" style={{ opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1 }}>
        {competitionLabel}
      </Text>
      <Text variant="titleMedium">
        {match.homeTeam} vs {match.awayTeam}
      </Text>
      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
        {new Date(match.startTime).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
      </Text>

      {isFinished && (
        <Text variant="bodyMedium" style={{ marginTop: 4 }}>
          Resultado: {match.homeScore} - {match.awayScore}
          {match.realQualifier && ` · Clasifica: ${match.realQualifier === 'home' ? match.homeTeam : match.awayTeam}`}
        </Text>
      )}

      {!isFinished && !showResultForm && (
        <Button mode="outlined" compact style={{ marginTop: 8, alignSelf: 'flex-start' }} onPress={() => setShowResultForm(true)}>
          Añadir resultado
        </Button>
      )}

      {showResultForm && (
        <View style={styles.resultForm}>
          <TextInput label={match.homeTeam} value={homeScore} onChangeText={setHomeScore} keyboardType="numeric" mode="outlined" dense style={styles.scoreInput} />
          <Text variant="headlineSmall" style={{ opacity: 0.4 }}>-</Text>
          <TextInput label={match.awayTeam} value={awayScore} onChangeText={setAwayScore} keyboardType="numeric" mode="outlined" dense style={styles.scoreInput} />
          <Button mode="contained" compact onPress={() => saveResult()} loading={savingResult}
            disabled={savingResult || homeScore === '' || awayScore === ''}>
            Guardar
          </Button>
          <Button mode="text" compact onPress={() => setShowResultForm(false)}>Cancelar</Button>
        </View>
      )}

      {needsQualifier && (
        <View style={{ marginTop: 8, gap: 4 }}>
          <Text variant="labelMedium">Empate — ¿quién se clasifica?</Text>
          <View style={styles.qualRow}>
            <Button mode="contained-tonal" onPress={() => saveQualifier('home')} loading={savingQualifier} disabled={savingQualifier}>
              {match.homeTeam}
            </Button>
            <Button mode="contained-tonal" onPress={() => saveQualifier('away')} loading={savingQualifier} disabled={savingQualifier}>
              {match.awayTeam}
            </Button>
          </View>
        </View>
      )}
    </Surface>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────

export default function AdminPanelScreen() {
  const { groupId, season } = useLocalSearchParams<{ groupId: string; season: string }>();
  const { user } = useAuth();
  const theme = useTheme();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'rules' | 'multipliers' | 'matches' | 'penalties' | 'adjustments'>('rules');

  // ── Rules ──────────────────────────────────────────────────────────────────
  const [localRules, setLocalRules] = useState<RuleEntry[] | null>(null);
  const [localComps, setLocalComps] = useState<('copa_del_rey' | 'supercopa')[] | null>(null);
  const [localFeatures, setLocalFeatures] = useState<GroupFeature[] | null>(null);
  const [rulesSaved, setRulesSaved] = useState(false);

  const { isLoading: settingsLoading, data: settingsData } = useQuery({
    queryKey: ['rule-settings', groupId, season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, season),
  });
  if (settingsData && !localRules) {
    setLocalRules(settingsData.rules.map((r) => ({ ...r })));
    setLocalComps(settingsData.enabledCompetitions ?? []);
    setLocalFeatures(settingsData.enabledFeatures ?? []);
  }

  const { mutate: saveRules, isPending: savingRules } = useMutation({
    mutationFn: () => adminGroupApi.updateRuleSettings(
      groupId, season,
      (localRules ?? []).map((r) => ({ key: r.rule.key, points: r.points, active: r.active })),
      localComps ?? [],
      localFeatures ?? []
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rule-settings', groupId, season] }); setRulesSaved(true); },
  });

  function patchRule(key: string, patch: { points?: number; active?: boolean }) {
    setLocalRules((prev) => (prev ?? []).map((r) => r.rule.key === key ? { ...r, ...patch } : r));
    setRulesSaved(false);
  }

  function toggleComp(comp: 'copa_del_rey' | 'supercopa') {
    setLocalComps((prev) => { const c = prev ?? []; return c.includes(comp) ? c.filter((x) => x !== comp) : [...c, comp]; });
    setRulesSaved(false);
  }

  function toggleFeature(feat: GroupFeature) {
    setLocalFeatures((prev) => { const f = prev ?? []; return f.includes(feat) ? f.filter((x) => x !== feat) : [...f, feat]; });
    setRulesSaved(false);
  }

  // ── Multipliers ────────────────────────────────────────────────────────────
  const [newScope, setNewScope] = useState<'match' | 'matchday'>('matchday');
  const [newMatchday, setNewMatchday] = useState('');
  const [newMatchId, setNewMatchId] = useState('');
  const [newValue, setNewValue] = useState('2');

  const { data: multipliers, isLoading: multipliersLoading } = useQuery({
    queryKey: ['multipliers', groupId, season],
    queryFn: () => adminGroupApi.listMultipliers(groupId, season),
    enabled: tab === 'multipliers',
  });

  const { data: allMatches } = useQuery({
    queryKey: ['matches', season],
    queryFn: () => predictionsApi.listMatches(season),
    enabled: tab === 'multipliers',
    staleTime: Infinity,
  });

  const matchById = new Map((allMatches ?? []).map((m) => [m._id, m]));

  const { mutate: createMult, isPending: creatingMult } = useMutation({
    mutationFn: () => adminGroupApi.createMultiplier(groupId, {
      season, scope: newScope,
      match: newScope === 'match' ? newMatchId : undefined,
      matchday: newScope === 'matchday' ? parseInt(newMatchday, 10) : undefined,
      multiplier: parseInt(newValue, 10),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['multipliers', groupId, season] }); setNewMatchday(''); setNewMatchId(''); setNewValue('2'); },
  });

  const { mutate: deleteMult } = useMutation({
    mutationFn: (id: string) => adminGroupApi.deleteMultiplier(groupId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['multipliers', groupId, season] }),
  });

  const canCreateMult = parseInt(newValue, 10) >= 1 && (
    newScope === 'matchday' ? parseInt(newMatchday, 10) >= 1 : newMatchId.length > 0
  );

  // ── Matches (global admin only) ────────────────────────────────────────────
  const isGlobalAdmin = user?.role === 'admin';
  const [newCompetition, setNewCompetition] = useState<'copa_del_rey' | 'supercopa'>('copa_del_rey');
  const [newHome, setNewHome] = useState('');
  const [newAway, setNewAway] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const { data: knockoutMatches, isLoading: knockoutLoading } = useQuery({
    queryKey: ['knockout-admin-matches', season],
    queryFn: () => Promise.all([
      predictionsApi.listMatches(season).then((ms) => ms.filter((m) => m.isKnockout)),
    ]).then(([ms]) => ms),
    enabled: tab === 'matches',
  });

  const { mutate: createMatch, isPending: creatingMatch } = useMutation({
    mutationFn: () => {
      const startTime = new Date(`${newDate}T${newTime || '20:00'}:00`).toISOString();
      return adminMatchesApi.create({ season, competition: newCompetition, homeTeam: newHome.trim(), awayTeam: newAway.trim(), startTime });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knockout-admin-matches', season] });
      qc.invalidateQueries({ queryKey: ['knockout-matches', season] });
      setNewHome(''); setNewAway(''); setNewDate(''); setNewTime('');
    },
  });

  const canCreateMatch = newHome.trim().length > 0 && newAway.trim().length > 0 && newDate.length === 10;

  // ── Penalties ──────────────────────────────────────────────────────────────
  const [localPenalties, setLocalPenalties] = useState<PenaltyEntry[]>([
    { position: 1, amount: 0 },
    { position: 2, amount: 0 },
    { position: 3, amount: 0 },
  ]);
  const [penaltiesSaved, setPenaltiesSaved] = useState(false);

  const { data: penaltyConfig } = useQuery({
    queryKey: ['penalty-config', groupId, season],
    queryFn: () => penaltiesApi.getConfig(groupId, season),
    enabled: tab === 'penalties',
  });
  if (penaltyConfig && localPenalties[0].amount === 0 && penaltyConfig.penalties.length > 0) {
    setLocalPenalties(penaltyConfig.penalties.map((p) => ({ ...p })));
  }

  const { mutate: savePenalties, isPending: savingPenalties } = useMutation({
    mutationFn: () => penaltiesApi.updateConfig(groupId, season, localPenalties),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['penalty-config', groupId, season] }); setPenaltiesSaved(true); },
  });

  const { mutate: recalculate, isPending: recalculating } = useMutation({
    mutationFn: () => penaltiesApi.recalculate(groupId, season),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['debt', groupId, season] }),
  });

  function patchPenalty(position: number, amount: number) {
    setLocalPenalties((prev) => prev.map((p) => p.position === position ? { ...p, amount } : p));
    setPenaltiesSaved(false);
  }

  // ── Adjustments ────────────────────────────────────────────────────────────
  const [adjUserId, setAdjUserId] = useState('');
  const [adjPoints, setAdjPoints] = useState('');
  const [adjMoney, setAdjMoney] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const { data: groupDetail } = useQuery({
    queryKey: ['group-detail', groupId],
    queryFn: () => groupsApi.get(groupId),
    enabled: tab === 'adjustments',
  });

  const { data: currentRanking } = useQuery({
    queryKey: ['ranking', groupId, season],
    queryFn: () => rankingApi.get(groupId, season),
    enabled: tab === 'adjustments',
  });
  const pointsByUser = new Map(currentRanking?.map((r) => [r.user.id, r.points]) ?? []);

  const { data: adjustments, isLoading: adjLoading } = useQuery({
    queryKey: ['adjustments', groupId, season],
    queryFn: () => manualAdjustmentsApi.list(groupId, season).then((r) => r.adjustments),
    enabled: tab === 'adjustments',
  });

  const { mutate: createAdj, isPending: creatingAdj } = useMutation({
    mutationFn: () => manualAdjustmentsApi.create(groupId, {
      season,
      userId: adjUserId,
      points: adjPoints !== '' ? parseInt(adjPoints, 10) : undefined,
      moneyAmount: adjMoney !== '' ? parseFloat(adjMoney) : undefined,
      reason: adjReason.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adjustments', groupId, season] });
      qc.invalidateQueries({ queryKey: ['ranking', groupId, season] });
      setAdjUserId(''); setAdjPoints(''); setAdjMoney(''); setAdjReason('');
    },
  });

  const { mutate: deleteAdj } = useMutation({
    mutationFn: (id: string) => manualAdjustmentsApi.delete(groupId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adjustments', groupId, season] });
      qc.invalidateQueries({ queryKey: ['ranking', groupId, season] });
    },
  });

  const adjPtsNum = adjPoints !== '' ? parseInt(adjPoints, 10) : 0;
  const adjMoneyNum = adjMoney !== '' ? parseFloat(adjMoney) : 0;
  const canCreateAdj = adjUserId.length > 0 && (adjPtsNum !== 0 || adjMoneyNum !== 0) && !isNaN(adjPtsNum) && !isNaN(adjMoneyNum);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs: Array<{ key: 'rules' | 'multipliers' | 'matches' | 'penalties' | 'adjustments'; label: string }> = [
    { key: 'rules', label: 'Reglas' },
    { key: 'multipliers', label: 'Multiplicadores' },
    { key: 'penalties', label: 'Bote' },
    { key: 'adjustments', label: 'Ajustes' },
    ...(isGlobalAdmin ? [{ key: 'matches' as const, label: 'Partidos' }] : []),
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <View style={styles.tabRow}>
        {tabs.map((t) => (
          <Chip key={t.key} selected={tab === t.key} onPress={() => setTab(t.key)} style={{ flex: 1 }}>
            {t.label}
          </Chip>
        ))}
      </View>

      {/* ── RULES ── */}
      {tab === 'rules' && (
        settingsLoading || !localRules ? <ActivityIndicator style={{ marginTop: 24 }} /> : (
          <>
            {(['match', 'standings', 'award', 'knockout'] as const).map((scope) => {
              const scopeLabel: Record<string, string> = { match: 'Partidos', standings: 'Clasificación', award: 'Premios', knockout: 'Eliminatorias' };
              const scopeRules = localRules.filter((r) => r.rule.scope === scope);
              if (!scopeRules.length) return null;
              return (
                <View key={scope}>
                  <Text variant="titleSmall" style={styles.sectionTitle}>{scopeLabel[scope]}</Text>
                  {scopeRules.map((r) => <RuleRow key={r.rule.key} entry={r} onChange={patchRule} />)}
                  <Divider style={styles.divider} />
                </View>
              );
            })}

            <Text variant="titleSmall" style={styles.sectionTitle}>Funcionalidades activas</Text>
            <View style={styles.tabRow}>
              <Chip selected={(localFeatures ?? []).includes('standings')} onPress={() => toggleFeature('standings')} style={{ flex: 1 }}>Clasificación</Chip>
              <Chip selected={(localFeatures ?? []).includes('pichichi')} onPress={() => toggleFeature('pichichi')} style={{ flex: 1 }}>Pichichi</Chip>
              <Chip selected={(localFeatures ?? []).includes('zamora')} onPress={() => toggleFeature('zamora')} style={{ flex: 1 }}>Zamora</Chip>
            </View>
            <Text variant="labelSmall" style={styles.compNote}>Activa las secciones que quieras en tu peña.</Text>

            <Text variant="titleSmall" style={[styles.sectionTitle, { marginTop: 8 }]}>Competiciones activas</Text>
            <View style={styles.tabRow}>
              <Chip selected={(localComps ?? []).includes('copa_del_rey')} onPress={() => toggleComp('copa_del_rey')} style={{ flex: 1 }}>Copa del Rey</Chip>
              <Chip selected={(localComps ?? []).includes('supercopa')} onPress={() => toggleComp('supercopa')} style={{ flex: 1 }}>Supercopa</Chip>
            </View>
            <Text variant="labelSmall" style={styles.compNote}>Las competiciones desactivadas no generan puntos.</Text>

            <View style={styles.saveRow}>
              {rulesSaved && <Text variant="labelMedium" style={{ color: theme.colors.primary }}>✓ Guardado</Text>}
              <Button mode="contained" onPress={() => saveRules()} loading={savingRules} disabled={savingRules} style={{ flex: 1 }}>
                Guardar configuración
              </Button>
            </View>
          </>
        )
      )}

      {/* ── MULTIPLIERS ── */}
      {tab === 'multipliers' && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>Añadir multiplicador</Text>
          <View style={styles.tabRow}>
            <Chip selected={newScope === 'matchday'} onPress={() => setNewScope('matchday')} style={{ flex: 1 }}>Por jornada</Chip>
            <Chip selected={newScope === 'match'} onPress={() => setNewScope('match')} style={{ flex: 1 }}>Por partido</Chip>
          </View>

          {newScope === 'matchday' && (
            <TextInput label="Jornada (1-38)" value={newMatchday} onChangeText={setNewMatchday} keyboardType="numeric" mode="outlined" dense />
          )}
          {newScope === 'match' && (
            <ScrollView style={styles.matchList} nestedScrollEnabled>
              {(allMatches ?? []).map((m) => (
                <List.Item
                  key={m._id}
                  title={`${m.homeTeam} vs ${m.awayTeam}`}
                  description={`J${m.matchday ?? '—'} · ${new Date(m.startTime).toLocaleDateString('es-ES')}`}
                  onPress={() => setNewMatchId(m._id)}
                  right={() => newMatchId === m._id ? <List.Icon icon="check-circle" color={theme.colors.primary} /> : null}
                  style={newMatchId === m._id ? { backgroundColor: theme.colors.primaryContainer } : undefined}
                />
              ))}
            </ScrollView>
          )}

          <TextInput label="Multiplicador (×2, ×3…)" value={newValue} onChangeText={setNewValue} keyboardType="numeric" mode="outlined" dense style={{ marginTop: 8 }} />
          <Button mode="contained" onPress={() => createMult()} loading={creatingMult} disabled={creatingMult || !canCreateMult}>
            Añadir multiplicador
          </Button>

          <Divider style={styles.divider} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Multiplicadores activos</Text>
          {multipliersLoading && <ActivityIndicator />}
          {multipliers?.length === 0 && <Text style={{ opacity: 0.5 }}>Sin multiplicadores.</Text>}
          {multipliers?.map((m) => {
            const match = m.scope === 'match' && m.match ? matchById.get(m.match) : undefined;
            const title = m.scope === 'matchday'
              ? `×${m.multiplier} — Jornada ${m.matchday}`
              : match
                ? `×${m.multiplier} — ${match.homeTeam} vs ${match.awayTeam} (J${match.matchday ?? '—'})`
                : `×${m.multiplier} — Partido ID: ${m.match}`;
            return (
              <List.Item
                key={m._id}
                title={title}
                description={`Temporada ${m.season}`}
                right={() => <IconButton icon="delete" onPress={() => deleteMult(m._id)} />}
              />
            );
          })}
        </>
      )}

      {/* ── PENALTIES / BOTE ── */}
      {tab === 'penalties' && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>Penalización por jornada</Text>
          <Text variant="bodySmall" style={styles.compNote}>
            Configura cuántos euros ficticioss acumula cada posición de los últimos de la jornada. 0 = sin penalización.
          </Text>
          {[1, 2, 3].map((pos) => {
            const label = pos === 1 ? 'Último' : pos === 2 ? 'Penúltimo' : 'Antepenúltimo';
            const entry = localPenalties.find((p) => p.position === pos) ?? { position: pos, amount: 0 };
            return (
              <View key={pos} style={styles.penaltyRow}>
                <Text variant="bodyMedium" style={{ flex: 1 }}>{label}</Text>
                <TextInput
                  value={String(entry.amount)}
                  onChangeText={(v) => { const n = parseFloat(v); if (!isNaN(n) && n >= 0) patchPenalty(pos, n); }}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  style={styles.pointsInput}
                  label="€"
                />
              </View>
            );
          })}
          <View style={styles.saveRow}>
            {penaltiesSaved && <Text variant="labelMedium" style={{ color: theme.colors.primary }}>✓ Guardado</Text>}
            <Button mode="contained" onPress={() => savePenalties()} loading={savingPenalties} disabled={savingPenalties} style={{ flex: 1 }}>
              Guardar
            </Button>
          </View>

          <Divider style={styles.divider} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Recalcular deuda</Text>
          <Text variant="bodySmall" style={styles.compNote}>
            Aplica la configuración actual a todas las jornadas ya jugadas, sobreescribiendo los cálculos anteriores.
          </Text>
          <Button mode="outlined" icon="calculator" onPress={() => recalculate()} loading={recalculating} disabled={recalculating}>
            Recalcular toda la deuda
          </Button>
        </>
      )}

      {/* ── ADJUSTMENTS ── */}
      {tab === 'adjustments' && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>Selecciona jugador</Text>
          {(groupDetail?.members ?? []).map((m: GroupMember) => {
            const pts = pointsByUser.get(m._id);
            return (
              <List.Item
                key={m._id}
                title={m.alias}
                description={pts != null ? `${pts} pts actuales` : m.email}
                onPress={() => setAdjUserId(m._id)}
                right={() => adjUserId === m._id ? <List.Icon icon="check-circle" color={theme.colors.primary} /> : null}
                style={adjUserId === m._id ? { backgroundColor: theme.colors.primaryContainer, borderRadius: 8 } : undefined}
              />
            );
          })}

          <View style={styles.adjRow}>
            <TextInput
              label="Puntos (±)"
              value={adjPoints}
              onChangeText={setAdjPoints}
              keyboardType="numbers-and-punctuation"
              mode="outlined"
              dense
              style={{ flex: 1 }}
              placeholder="-3 o 5"
            />
            <TextInput
              label="Euros (±)"
              value={adjMoney}
              onChangeText={setAdjMoney}
              keyboardType="numbers-and-punctuation"
              mode="outlined"
              dense
              style={{ flex: 1 }}
              placeholder="-2 o 1.5"
            />
          </View>
          <TextInput
            label="Motivo (opcional)"
            value={adjReason}
            onChangeText={setAdjReason}
            mode="outlined"
            dense
            placeholder="Error en jornada 12"
          />
          <Button
            mode="contained"
            onPress={() => createAdj()}
            loading={creatingAdj}
            disabled={creatingAdj || !canCreateAdj}
          >
            Aplicar ajuste
          </Button>

          <Divider style={styles.divider} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Ajustes aplicados</Text>
          {adjLoading && <ActivityIndicator />}
          {adjustments?.length === 0 && <Text style={{ opacity: 0.5 }}>Sin ajustes esta temporada.</Text>}
          {adjustments?.map((adj: ManualAdjustment) => {
            const parts: string[] = [];
            if (adj.points !== 0) parts.push(`${adj.points > 0 ? '+' : ''}${adj.points} pts`);
            if (adj.moneyAmount !== 0) parts.push(`${adj.moneyAmount > 0 ? '+' : ''}${adj.moneyAmount}€`);
            const isPositive = adj.points > 0 || adj.moneyAmount > 0;
            return (
              <List.Item
                key={adj._id}
                title={`${adj.user.alias} · ${parts.join(' / ')}`}
                description={adj.reason ?? new Date(adj.createdAt).toLocaleDateString('es-ES')}
                titleStyle={{ color: isPositive ? '#15803D' : '#B91C1C' }}
                right={() => <IconButton icon="delete" onPress={() => deleteAdj(adj._id)} />}
              />
            );
          })}
        </>
      )}

      {/* ── MATCHES (global admin) ── */}
      {tab === 'matches' && isGlobalAdmin && (
        <>
          <Text variant="titleSmall" style={styles.sectionTitle}>Crear partido</Text>
          <View style={styles.tabRow}>
            <Chip selected={newCompetition === 'copa_del_rey'} onPress={() => setNewCompetition('copa_del_rey')} style={{ flex: 1 }}>Copa del Rey</Chip>
            <Chip selected={newCompetition === 'supercopa'} onPress={() => setNewCompetition('supercopa')} style={{ flex: 1 }}>Supercopa</Chip>
          </View>
          <TextInput label="Equipo local" value={newHome} onChangeText={setNewHome} mode="outlined" dense />
          <TextInput label="Equipo visitante" value={newAway} onChangeText={setNewAway} mode="outlined" dense />
          <View style={styles.dateRow}>
            <TextInput label="Fecha (YYYY-MM-DD)" value={newDate} onChangeText={setNewDate} mode="outlined" dense style={{ flex: 2 }} placeholder="2027-01-15" />
            <TextInput label="Hora (HH:MM)" value={newTime} onChangeText={setNewTime} mode="outlined" dense style={{ flex: 1 }} placeholder="20:00" />
          </View>
          <Button mode="contained" onPress={() => createMatch()} loading={creatingMatch} disabled={creatingMatch || !canCreateMatch}>
            Crear partido
          </Button>

          <Divider style={styles.divider} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Partidos Copa / Supercopa</Text>
          {knockoutLoading && <ActivityIndicator />}
          {knockoutMatches?.length === 0 && <Text style={{ opacity: 0.5 }}>Sin partidos de copa creados todavía.</Text>}
          {knockoutMatches?.map((m) => <MatchAdminCard key={m._id} match={m} season={season} />)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8 },
  sectionTitle: { fontWeight: '600', marginTop: 4 },
  divider: { marginVertical: 8 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  ruleInfo: { flex: 1 },
  ruleControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointsInput: { width: 64 },
  compNote: { opacity: 0.5, marginTop: 4 },
  saveRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  matchList: { maxHeight: 220, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', borderRadius: 8 },
  matchCard: { borderRadius: 10, padding: 14, gap: 6 },
  resultForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  scoreInput: { width: 80 },
  qualRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  penaltyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dateRow: { flexDirection: 'row', gap: 8 },
  adjRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
