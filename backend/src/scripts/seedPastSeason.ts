/**
 * seedPastSeason.ts
 *
 * Simula la temporada 2025-2026 completa para ver en la app el ranking,
 * las predicciones, las cartas, la clasificación y los premios tal y como
 * quedarían al final de la temporada.
 *
 * Crea:
 *   - Peña "Peña 2025-26" con el usuario real como admin
 *   - 4 usuarios ficticios (Carlos, María, Pedro, Laura) añadidos a la peña
 *   - 114 partidos de La Liga (38 jornadas × 3 partidos) todos terminados
 *   - 1 partido de Supercopa (Real Madrid 1-1 Barcelona → Real Madrid pasa)
 *   - Predicciones + PredictionScore para todos en todos los partidos
 *   - QualifierPrediction + QualifierPredictionScore para la Supercopa
 *   - CardDeal + CardPlay (1 carta por usuario por jornada, todas jugadas)
 *   - StandingsPrediction (ida + vuelta) + StandingsPredictionScore
 *   - AwardPrediction (Pichichi + Zamora) + AwardResult + AwardPredictionScore
 *   - PenaltyConfig + MatchdayPenalty (últimos de cada jornada)
 *
 * Ejecutar desde /backend: npx tsx src/scripts/seedPastSeason.ts
 */

import { connectDB } from '../config/db';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { User } from '../models/User';
import { Group } from '../models/Group';
import { Match } from '../models/Match';
import { Rule } from '../models/Rule';
import { GroupRuleSettings } from '../models/GroupRuleSettings';
import { CardConfig } from '../models/CardConfig';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { QualifierPrediction } from '../models/QualifierPrediction';
import { QualifierPredictionScore } from '../models/QualifierPredictionScore';
import { StandingsPrediction } from '../models/StandingsPrediction';
import { StandingsPredictionScore } from '../models/StandingsPredictionScore';
import { AwardPrediction } from '../models/AwardPrediction';
import { AwardPredictionScore } from '../models/AwardPredictionScore';
import { AwardResult } from '../models/AwardResult';
import { PenaltyConfig } from '../models/PenaltyConfig';
import { MatchdayPenalty } from '../models/MatchdayPenalty';
import { ALL_CARD_KEYS, CardKey } from '../types/enums';

// ── Constantes ───────────────────────────────────────────────────────────────

const REAL_USER_EMAIL = 'pepe@pepe.com';
const SEASON = '2025-2026';
const GROUP_NAME = 'Peña 2025-26';
const PASSWORD = 'test1234';

const TEAMS = [
  'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Athletic Club', 'Villarreal',
  'Real Sociedad', 'Betis', 'Osasuna', 'Girona', 'Valencia',
  'Rayo Vallecano', 'Getafe', 'Celta', 'Sevilla', 'Mallorca',
  'Las Palmas', 'Alaves', 'Leganes', 'Espanyol', 'Valladolid',
];

// Clasificación real final 2025-2026 (inventada)
const REAL_TABLE = [
  'Barcelona', 'Real Madrid', 'Atletico Madrid', 'Athletic Club', 'Villarreal',
  'Real Sociedad', 'Betis', 'Osasuna', 'Girona', 'Valencia',
  'Rayo Vallecano', 'Getafe', 'Celta', 'Sevilla', 'Mallorca',
  'Las Palmas', 'Alaves', 'Leganes', 'Espanyol', 'Valladolid',
];

const FAKE_USERS = [
  { alias: 'Carlos',  email: 'carlos.porra25@test.com'  },
  { alias: 'María',   email: 'maria.porra25@test.com'   },
  { alias: 'Pedro',   email: 'pedro.porra25@test.com'   },
  { alias: 'Laura',   email: 'laura.porra25@test.com'   },
];

// Premios reales 2025-2026
const PICHICHI_WINNER = 'Robert Lewandowski';
const ZAMORA_WINNER   = 'Yassine Bounou';

// Predicciones de cada usuario para premios [pichichi, zamora]
const AWARD_PREDS: Record<string, [string, string]> = {
  Carlos:  ['Robert Lewandowski', 'Ter Stegen'],      // pichichi ✓ zamora ✗
  María:   ['Vinicius Jr.',       'Yassine Bounou'],   // pichichi ✗ zamora ✓
  Pedro:   ['Mbappé',             'Oblak'],            // ambos ✗
  Laura:   ['Yamal',              'Courtois'],         // ambos ✗
  // real user → ambos correctos (se asigna más abajo)
};

// Skill de predicción [P(exacto), P(signo correcto)]
// Orden: Carlos(0), María(1), realUser(2), Pedro(3), Laura(4)
const SKILLS: [number, number][] = [
  [0.50, 0.30], // Carlos   → ~310 pts de partidos
  [0.40, 0.30], // María    → ~265 pts
  [0.32, 0.28], // realUser → ~230 pts
  [0.18, 0.22], // Pedro    → ~153 pts
  [0.25, 0.25], // Laura    → ~195 pts
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function seeded(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function getMatchResult(j: number, mi: number): { home: number; away: number } {
  const r = seeded(j * 100 + mi);
  const g1 = seeded(j * 100 + mi + 50);
  const g2 = seeded(j * 100 + mi + 51);
  if (r < 0.45) {
    const h = Math.floor(g1 * 3) + 1;
    return { home: h, away: Math.floor(g2 * h) };
  }
  if (r < 0.73) {
    const a = Math.floor(g1 * 3) + 1;
    return { home: Math.floor(g2 * a), away: a };
  }
  return { home: Math.floor(g1 * 3), away: Math.floor(g1 * 3) };
}

function getUserPred(
  skillIdx: number, j: number, mi: number,
  result: { home: number; away: number }
): { home: number; away: number; pts: number } {
  const [pExact, pSign] = SKILLS[skillIdx];
  const r = seeded(j * 200 + mi * 50 + skillIdx * 7919);
  if (r < pExact) {
    return { home: result.home, away: result.away, pts: 5 };
  }
  if (r < pExact + pSign) {
    const s = result.home - result.away;
    if (s > 0) return { home: result.home + 1, away: result.away, pts: 2 };
    if (s < 0) return { home: result.home, away: result.away + 1, pts: 2 };
    return { home: result.home + 1, away: result.away + 1, pts: 2 };
  }
  const s = result.home - result.away;
  if (s > 0) return { home: 0, away: 1, pts: 0 };
  if (s < 0) return { home: 1, away: 0, pts: 0 };
  return { home: 2, away: 0, pts: 0 };
}

// Predicción de tabla para un usuario dado un desplazamiento de aciertos
function buildTable(offset: number): { position: number; team: string }[] {
  return REAL_TABLE.map((team, i) => {
    const predictedPos = ((i + offset) % 20) + 1;
    return { position: predictedPos, team };
  }).sort((a, b) => a.position - b.position);
}

// Puntos de clasificación: 1 pt por posición exacta
function standingsPoints(predicted: { position: number; team: string }[]): number {
  let pts = 0;
  for (const entry of predicted) {
    if (REAL_TABLE[entry.position - 1] === entry.team) pts++;
  }
  return pts;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await connectDB();
  console.log('✓ Conectado a MongoDB\n');

  const hashed = await bcrypt.hash(PASSWORD, 10);

  // 1. Usuario real
  const realUser = await User.findOne({ email: REAL_USER_EMAIL });
  if (!realUser) {
    console.error(`✗ Usuario real (${REAL_USER_EMAIL}) no encontrado. Regístrate primero en la app.`);
    process.exit(1);
  }
  console.log(`✓ Usuario real: ${realUser.alias} (${realUser.email})`);

  // 2. Usuarios ficticios
  const fakeUserDocs = [];
  for (const u of FAKE_USERS) {
    let doc = await User.findOne({ email: u.email });
    if (!doc) {
      doc = await User.create({ alias: u.alias, email: u.email, password: hashed, role: 'user' });
      console.log(`  + Usuario creado: ${u.alias}`);
    }
    fakeUserDocs.push(doc);
  }

  // Orden fijo: Carlos, María, realUser, Pedro, Laura (coincide con SKILLS)
  const [carlosDoc, mariaDoc, pedroDoc, lauraDoc] = fakeUserDocs;
  const allUsers = [carlosDoc, mariaDoc, realUser, pedroDoc, lauraDoc];
  // SKILLS idx:       0         1        2          3         4

  // 3. Peña
  let group = await Group.findOne({ name: GROUP_NAME });
  if (!group) {
    group = await Group.create({
      name: GROUP_NAME,
      season: SEASON,
      admin: realUser._id,
      members: allUsers.map((u) => u._id),
      inviteCode: `past2526`,
    });
    console.log(`✓ Peña creada: ${GROUP_NAME}`);
  } else {
    // Asegurar que todos los usuarios son miembros
    await Group.findByIdAndUpdate(group._id, {
      $addToSet: { members: { $each: allUsers.map((u) => u._id) } },
    });
    console.log(`✓ Peña existente: ${GROUP_NAME}`);
  }

  const groupId = group._id;

  // 4. Rules del catálogo
  const rules = await Rule.find({});
  const ruleMap = new Map(rules.map((r) => [r.key, r]));
  const ruleConfig = [
    { key: 'exact_score',         points: 5,  active: true  },
    { key: 'correct_sign',        points: 2,  active: true  },
    { key: 'standings_position',  points: 1,  active: true  },
    { key: 'pichichi_correct',    points: 10, active: true  },
    { key: 'zamora_correct',      points: 10, active: true  },
    { key: 'knockout_qualifier',  points: 2,  active: true  },
  ].filter((r) => ruleMap.has(r.key))
   .map((r) => ({ rule: ruleMap.get(r.key)!._id, points: r.points, active: r.active }));

  await GroupRuleSettings.findOneAndUpdate(
    { group: groupId, season: SEASON },
    {
      group: groupId, season: SEASON,
      rules: ruleConfig,
      enabledCompetitions: ['supercopa'],
      enabledFeatures: ['standings', 'pichichi', 'zamora'],
    },
    { upsert: true }
  );
  console.log('✓ GroupRuleSettings configurado');

  // 5. CardConfig (todas las cartas habilitadas)
  await CardConfig.findOneAndUpdate(
    { group: groupId, season: SEASON },
    { group: groupId, season: SEASON, enabledCards: ALL_CARD_KEYS, melaJuegoLimit: 20 },
    { upsert: true }
  );
  console.log('✓ CardConfig configurado');

  // 6. PenaltyConfig
  await PenaltyConfig.findOneAndUpdate(
    { group: groupId, season: SEASON },
    {
      group: groupId, season: SEASON,
      penalties: [{ position: 1, amount: 3 }, { position: 2, amount: 2 }, { position: 3, amount: 1 }],
    },
    { upsert: true }
  );
  console.log('✓ PenaltyConfig configurado');

  // 7. Partidos de La Liga (38 jornadas × 3 partidos)
  // startTime: temporada 2025-2026 arrancó el 15/08/2025, ~1 semana por jornada
  const seasonStart = new Date('2025-08-15T20:00:00Z');
  const laLigaMatches: Awaited<ReturnType<typeof Match.findOne>>[] = [];

  console.log('→ Creando partidos de La Liga…');
  for (let j = 1; j <= 38; j++) {
    for (let mi = 0; mi < 3; mi++) {
      const homeIdx = ((j - 1) * 3 + mi) % 20;
      const awayIdx = (homeIdx + 10) % 20;
      const result = getMatchResult(j, mi);
      const startTime = new Date(seasonStart.getTime() + (j - 1) * 7 * 24 * 3600 * 1000 + mi * 2 * 3600 * 1000);

      const match = await Match.findOneAndUpdate(
        { season: SEASON, competition: 'la_liga', matchday: j, homeTeam: TEAMS[homeIdx], awayTeam: TEAMS[awayIdx] },
        {
          season: SEASON, competition: 'la_liga', matchday: j,
          isKnockout: false,
          homeTeam: TEAMS[homeIdx], awayTeam: TEAMS[awayIdx],
          startTime,
          homeScore: result.home, awayScore: result.away,
          status: 'finished',
        },
        { upsert: true, new: true }
      );
      laLigaMatches.push(match);
    }
  }
  console.log(`✓ ${laLigaMatches.length} partidos de La Liga creados`);

  // 8. Partido de Supercopa (1-1 → Real Madrid se clasifica)
  const supercopaStart = new Date('2026-01-12T21:00:00Z');
  const supercopa = await Match.findOneAndUpdate(
    { season: SEASON, competition: 'supercopa', homeTeam: 'Real Madrid', awayTeam: 'Barcelona' },
    {
      season: SEASON, competition: 'supercopa',
      isKnockout: true,
      homeTeam: 'Real Madrid', awayTeam: 'Barcelona',
      startTime: supercopaStart,
      homeScore: 1, awayScore: 1,
      status: 'finished',
      realQualifier: 'home', // Real Madrid pasa
    },
    { upsert: true, new: true }
  );
  console.log('✓ Partido de Supercopa creado (Real Madrid 1-1 Barcelona → Real Madrid)');

  // 9. Predicciones + puntuaciones de La Liga
  console.log('→ Creando predicciones de La Liga…');
  let totalPreds = 0;

  // Acumular puntos por jornada para las penalizaciones
  const jornadaPts: Map<number, { userId: string; pts: number }[]> = new Map();

  for (let j = 1; j <= 38; j++) {
    jornadaPts.set(j, []);
  }

  for (let ui = 0; ui < allUsers.length; ui++) {
    const user = allUsers[ui];

    for (let j = 1; j <= 38; j++) {
      let jornadaTotal = 0;

      for (let mi = 0; mi < 3; mi++) {
        const match = laLigaMatches[(j - 1) * 3 + mi];
        if (!match) continue;

        const result = { home: match.homeScore ?? 0, away: match.awayScore ?? 0 };
        const pred = getUserPred(ui, j, mi, result);

        const predDoc = await Prediction.findOneAndUpdate(
          { user: user._id, match: match._id },
          { user: user._id, match: match._id, predictedHome: pred.home, predictedAway: pred.away, status: 'scored' },
          { upsert: true, new: true }
        );

        await PredictionScore.findOneAndUpdate(
          { prediction: predDoc!._id, group: groupId },
          { prediction: predDoc!._id, group: groupId, points: pred.pts, ruleBreakdown: [] },
          { upsert: true }
        );

        jornadaTotal += pred.pts;
        totalPreds++;
      }

      jornadaPts.get(j)!.push({ userId: user._id.toString(), pts: jornadaTotal });
    }
  }
  console.log(`✓ ${totalPreds} predicciones de La Liga creadas`);

  // 10. Predicciones + puntuaciones de Supercopa
  const supercopaResult = { home: 1, away: 1 };
  // user predictions for Supercopa (score):
  // Carlos: 1-1 (exact ✓), María: 2-0 (wrong), realUser: 1-1 (exact ✓), Pedro: 1-0 (wrong sign), Laura: 0-1 (wrong sign)
  const superPreds = [
    { home: 1, away: 1, pts: 5 }, // Carlos exact
    { home: 2, away: 0, pts: 0 }, // María wrong
    { home: 1, away: 1, pts: 5 }, // realUser exact
    { home: 1, away: 0, pts: 0 }, // Pedro wrong (home win but was draw)
    { home: 0, away: 1, pts: 0 }, // Laura wrong
  ];
  // qualifier predictions: 'home' = Real Madrid
  // Carlos ✓, María ✓, realUser ✓, Pedro ✗ (predicts away), Laura ✓
  const qualifierPreds = ['home', 'home', 'home', 'away', 'home'] as const;
  const qualifierPts = [2, 2, 2, 0, 2];

  const superPredDocs = [];
  for (let ui = 0; ui < allUsers.length; ui++) {
    const user = allUsers[ui];
    const sp = superPreds[ui];

    const predDoc = await Prediction.findOneAndUpdate(
      { user: user._id, match: supercopa!._id },
      { user: user._id, match: supercopa!._id, predictedHome: sp.home, predictedAway: sp.away, status: 'scored' },
      { upsert: true, new: true }
    );
    await PredictionScore.findOneAndUpdate(
      { prediction: predDoc!._id, group: groupId },
      { prediction: predDoc!._id, group: groupId, points: sp.pts, ruleBreakdown: [] },
      { upsert: true }
    );

    await QualifierPrediction.findOneAndUpdate(
      { user: user._id, match: supercopa!._id },
      { user: user._id, match: supercopa!._id, predictedQualifier: qualifierPreds[ui], status: 'scored' },
      { upsert: true }
    );
    // QualifierPredictionScore referencia la Prediction (marcador), no la QualifierPrediction
    await QualifierPredictionScore.findOneAndUpdate(
      { prediction: predDoc!._id, group: groupId },
      { prediction: predDoc!._id, group: groupId, points: qualifierPts[ui] },
      { upsert: true }
    );

    superPredDocs.push(predDoc);
  }
  console.log('✓ Predicciones de Supercopa creadas');

  // 11. Cartas (1 por usuario por jornada, rotando las 10 cartas, todas jugadas)
  console.log('→ Creando cartas…');
  let totalCards = 0;
  for (let ui = 0; ui < allUsers.length; ui++) {
    const user = allUsers[ui];
    for (let j = 1; j <= 38; j++) {
      const cardKey = ALL_CARD_KEYS[(j + ui * 3) % ALL_CARD_KEYS.length] as CardKey;
      const dealtAt = new Date(seasonStart.getTime() + (j - 2) * 7 * 24 * 3600 * 1000);

      const deal = await CardDeal.findOneAndUpdate(
        { group: groupId, season: SEASON, matchday: j, user: user._id },
        { group: groupId, season: SEASON, matchday: j, user: user._id, card: cardKey, status: 'played', dealtAt },
        { upsert: true, new: true }
      );

      // CardPlay con params mínimos (solo para que status='played' tenga sentido)
      await CardPlay.findOneAndUpdate(
        { deal: deal!._id },
        { deal: deal!._id, params: {}, playedAt: new Date(dealtAt.getTime() + 3 * 3600 * 1000) },
        { upsert: true }
      );
      totalCards++;
    }
  }
  console.log(`✓ ${totalCards} cartas creadas`);

  // 12. Predicciones de clasificación (ida J19 + vuelta J38)
  // Offsets de predicción por usuario: más cercano = mejor puntuación
  const tableOffsets = [0, 2, 1, 5, 4]; // Carlos predice perfecto, resto con errores
  const phases = ['ida', 'vuelta'] as const;

  for (let ui = 0; ui < allUsers.length; ui++) {
    const user = allUsers[ui];
    const predictedTable = buildTable(tableOffsets[ui]);
    const pts = standingsPoints(predictedTable);

    for (const phase of phases) {
      const spDoc = await StandingsPrediction.findOneAndUpdate(
        { user: user._id, season: SEASON, phase },
        { user: user._id, season: SEASON, phase, predictedTable, status: 'scored' },
        { upsert: true, new: true }
      );
      await StandingsPredictionScore.findOneAndUpdate(
        { standingsPrediction: spDoc!._id, group: groupId },
        { standingsPrediction: spDoc!._id, group: groupId, points: pts, ruleBreakdown: [] },
        { upsert: true }
      );
    }
  }
  console.log('✓ Predicciones de clasificación creadas');

  // 13. AwardResult (resultados reales de la temporada)
  await AwardResult.findOneAndUpdate(
    { season: SEASON, award: 'pichichi' },
    { season: SEASON, award: 'pichichi', realPlayer: PICHICHI_WINNER },
    { upsert: true }
  );
  await AwardResult.findOneAndUpdate(
    { season: SEASON, award: 'zamora' },
    { season: SEASON, award: 'zamora', realPlayer: ZAMORA_WINNER },
    { upsert: true }
  );
  console.log(`✓ AwardResult: Pichichi=${PICHICHI_WINNER}, Zamora=${ZAMORA_WINNER}`);

  // 14. AwardPredictions + AwardPredictionScores
  const userAliases = [carlosDoc.alias, mariaDoc.alias, realUser.alias, pedroDoc.alias, lauraDoc.alias];
  for (let ui = 0; ui < allUsers.length; ui++) {
    const user = allUsers[ui];
    const alias = userAliases[ui];

    // Pichichi
    const picPred = AWARD_PREDS[alias]?.[0] ?? PICHICHI_WINNER; // real user → PICHICHI_WINNER
    const picPts = picPred === PICHICHI_WINNER ? 10 : 0;
    const picDoc = await AwardPrediction.findOneAndUpdate(
      { user: user._id, season: SEASON, award: 'pichichi' },
      { user: user._id, season: SEASON, award: 'pichichi', predictedPlayer: picPred, status: 'scored' },
      { upsert: true, new: true }
    );
    await AwardPredictionScore.findOneAndUpdate(
      { awardPrediction: picDoc!._id, group: groupId },
      { awardPrediction: picDoc!._id, group: groupId, points: picPts },
      { upsert: true }
    );

    // Zamora
    const zamPred = AWARD_PREDS[alias]?.[1] ?? ZAMORA_WINNER;
    const zamPts = zamPred === ZAMORA_WINNER ? 10 : 0;
    const zamDoc = await AwardPrediction.findOneAndUpdate(
      { user: user._id, season: SEASON, award: 'zamora' },
      { user: user._id, season: SEASON, award: 'zamora', predictedPlayer: zamPred, status: 'scored' },
      { upsert: true, new: true }
    );
    await AwardPredictionScore.findOneAndUpdate(
      { awardPrediction: zamDoc!._id, group: groupId },
      { awardPrediction: zamDoc!._id, group: groupId, points: zamPts },
      { upsert: true }
    );
  }
  console.log('✓ Predicciones de premios creadas');

  // 15. Penalizaciones por jornada (últimos 3 de cada jornada pagan)
  let totalPenalties = 0;
  for (let j = 1; j <= 38; j++) {
    const jRanking = jornadaPts.get(j) ?? [];
    jRanking.sort((a, b) => a.pts - b.pts); // ascendente: peor primero
    const amounts = [3, 2, 1];
    for (let pos = 0; pos < Math.min(3, jRanking.length); pos++) {
      await MatchdayPenalty.findOneAndUpdate(
        { group: groupId, season: SEASON, matchday: j, user: jRanking[pos].userId },
        { group: groupId, season: SEASON, matchday: j, user: jRanking[pos].userId, position: pos + 1, amount: amounts[pos] },
        { upsert: true }
      );
      totalPenalties++;
    }
  }
  console.log(`✓ ${totalPenalties} penalizaciones creadas`);

  // ── Resumen final ──────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(`  Temporada: ${SEASON}  |  Peña: ${GROUP_NAME}`);
  console.log('══════════════════════════════════════');

  // Calcular ranking total
  const totals: { alias: string; pts: number }[] = [];
  for (let ui = 0; ui < allUsers.length; ui++) {
    const user = allUsers[ui];
    const alias = userAliases[ui];

    const predScores = await PredictionScore.find({ group: groupId }).populate({
      path: 'prediction', match: { user: user._id },
    });
    const matchPts = predScores.filter((s) => s.prediction).reduce((a, s) => a + s.points, 0);

    const qualScores = await QualifierPredictionScore.find({ group: groupId }).populate({
      path: 'prediction', match: { user: user._id },
    });
    const qualPts = qualScores.filter((s) => s.prediction).reduce((a, s) => a + s.points, 0);

    const spScores = await StandingsPredictionScore.find({ group: groupId }).populate({
      path: 'standingsPrediction', match: { user: user._id },
    });
    const standPts = spScores.filter((s) => s.standingsPrediction).reduce((a, s) => a + s.points, 0);

    const awPics = await AwardPredictionScore.find({ group: groupId }).populate({
      path: 'awardPrediction', match: { user: user._id },
    });
    const awardPts = awPics.filter((s) => s.awardPrediction).reduce((a, s) => a + s.points, 0);

    const total = matchPts + qualPts + standPts + awardPts;
    totals.push({ alias, pts: total });
  }

  totals.sort((a, b) => b.pts - a.pts);
  totals.forEach((t, i) => console.log(`  ${i + 1}. ${t.alias.padEnd(12)} ${t.pts} pts`));
  console.log('══════════════════════════════════════\n');

  await mongoose.disconnect();
  console.log('✓ Listo');
}

main().catch((e) => { console.error(e); process.exit(1); });
