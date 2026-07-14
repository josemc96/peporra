/**
 * finishMockCards.ts
 *
 * Termina la jornada falsa J99 y calcula puntos con todos los efectos de cartas.
 * Ejecutar MAÑANA: npm run finish:mock-cards
 *
 * Lo que hace:
 *  1. Pone los 5 partidos de J99 como 'finished' con resultados reales
 *  2. Juega el_var de FakeVar: sabotea la predicción de FakeRoja en M1 (1-0 → 2-0)
 *  3. Ejecuta el job de cálculo de puntos (scoring + efectos de cartas)
 *  4. Imprime el ranking final con explicación de cada efecto
 *
 * Resultados: M0:2-1, M1:1-0, M2:2-2, M3:1-1, M4:1-1
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/db';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { PredictionScore } from '../models/PredictionScore';
import { CardEffect } from '../models/CardEffect';
import { calculateScores } from '../jobs/calculateScores.job';

const SEASON = '2026-2027';
const MATCHDAY = 99;
const GROUP_NAME = 'Peña Mock Cartas';

const RESULTS: Array<[number, number]> = [
  [2, 1], // M0: Real Madrid vs Barcelona
  [1, 0], // M1: Atletico vs Sevilla
  [2, 2], // M2: Valencia vs Villarreal
  [1, 1], // M3: Betis vs Getafe
  [1, 1], // M4: Osasuna vs Mallorca
];

function log(msg: string) { console.log(`[finishMockCards] ${msg}`); }

async function main() {
  await connectDB();
  log('Conectado a MongoDB');

  // ── 1. Encontrar grupo y partidos ──────────────────────────────────────────
  const group = await Group.findOne({ name: GROUP_NAME, season: SEASON });
  if (!group) {
    console.error(`Grupo "${GROUP_NAME}" no encontrado. ¿Ejecutaste npm run seed:mock-cards?`);
    process.exit(1);
  }
  log(`Grupo: ${group.name} (${group._id})`);

  const matches = await Match.find({ season: SEASON, competition: 'la_liga', matchday: MATCHDAY })
    .sort({ startTime: 1 });
  if (matches.length === 0) {
    console.error(`Sin partidos en J${MATCHDAY} de ${SEASON}. ¿Ejecutaste npm run seed:mock-cards?`);
    process.exit(1);
  }
  log(`Partidos encontrados: ${matches.length}`);

  // ── 2. Poner partidos como finished con resultados ─────────────────────────
  for (let i = 0; i < matches.length; i++) {
    const [h, a] = RESULTS[i] ?? [0, 0];
    await Match.findByIdAndUpdate(matches[i]._id, {
      status: 'finished',
      homeScore: h,
      awayScore: a,
    });
    log(`M${i} ${matches[i].homeTeam} vs ${matches[i].awayTeam}: ${h}-${a} (finished)`);
  }

  // ── 3. Jugar el_var: FakeVar sabotea FakeRoja en M1 (Atletico vs Sevilla) ──
  const fakeVarUser = await User.findOne({ email: 'fake.var.cards@test.com' });
  const fakeRojaUser = await User.findOne({ email: 'fake.roja.cards@test.com' });
  const match1 = matches[1]; // Atletico vs Sevilla

  if (fakeVarUser && fakeRojaUser && match1) {
    const varDeal = await CardDeal.findOne({
      group: group._id, season: SEASON, matchday: MATCHDAY,
      user: fakeVarUser._id, card: 'el_var', status: 'pending',
    });

    if (varDeal) {
      // Buscar la predicción de FakeRoja en M1: 1-0 → vamos a cambiar home +1 → 2-0
      const rojaM1Pred = await Prediction.findOne({ user: fakeRojaUser._id, match: match1._id });
      if (rojaM1Pred) {
        const before = `${rojaM1Pred.predictedHome}-${rojaM1Pred.predictedAway}`;
        rojaM1Pred.predictedHome = rojaM1Pred.predictedHome + 1; // 1-0 → 2-0
        rojaM1Pred.status = 'pending'; // fuerza re-scoring
        await rojaM1Pred.save();

        await CardPlay.create({
          deal: varDeal._id,
          targetUser: fakeRojaUser._id,
          targetMatch: match1._id,
          params: { side: 'home', delta: 1 },
        });
        await CardDeal.findByIdAndUpdate(varDeal._id, { status: 'played' });

        log(`⚡ el_var: FakeVar cambia predicción de FakeRoja en M1: ${before} → ${rojaM1Pred.predictedHome}-${rojaM1Pred.predictedAway}`);
        log(`   (Resultado real: 1-0. Antes: exacto 4pts → Después: solo signo 1pt. Pierde 3pts!)`);
      }
    } else {
      log('el_var: FakeVar ya jugó su carta o no se encontró el deal.');
    }
  }

  // ── 4. Calcular puntos ─────────────────────────────────────────────────────
  log('Calculando puntos (incluye efectos de cartas)...');
  const result = await calculateScores(SEASON);
  log(`Scoring completado: ${result.matchPredictionsScored} predicciones puntuadas`);

  // ── 5. Imprimir ranking ────────────────────────────────────────────────────
  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('🏆  RANKING FINAL J99');
  log('═══════════════════════════════════════════════════════════════');

  // Obtener todos los miembros del grupo
  const memberIds = group.members.map((m) => m.toString());

  // Cargar predicciones de J99
  const j99Matches = await Match.find({ season: SEASON, competition: 'la_liga', matchday: MATCHDAY });
  const j99MatchIds = j99Matches.map((m) => m._id);
  const preds = await Prediction.find({ match: { $in: j99MatchIds }, user: { $in: memberIds } });
  const predIds = preds.map((p) => p._id);

  // Puntos de PredictionScore
  const scores = await PredictionScore.find({ prediction: { $in: predIds }, group: group._id });
  const predScoreByPred = new Map(scores.map((s) => [s.prediction.toString(), s]));

  // Puntos de CardEffect
  const cardEffects = await CardEffect.find({ group: group._id, season: SEASON, matchday: MATCHDAY });
  const cardEffectByUser = new Map<string, number>();
  for (const ce of cardEffects) {
    const uid = ce.user.toString();
    cardEffectByUser.set(uid, (cardEffectByUser.get(uid) ?? 0) + ce.points);
  }

  // Agrupar PredictionScore por usuario
  const predPtsByUser = new Map<string, number>();
  for (const pred of preds) {
    const uid = pred.user.toString();
    const score = predScoreByPred.get((pred._id as Types.ObjectId).toString());
    if (score) {
      predPtsByUser.set(uid, (predPtsByUser.get(uid) ?? 0) + score.points);
    }
  }

  // Obtener alias de los usuarios
  const users = await User.find({ _id: { $in: memberIds } }).select('alias email');
  const aliasById = new Map(users.map((u) => [u._id.toString(), u.alias]));

  // Calcular total y ordenar
  const ranking = memberIds.map((uid) => {
    const predPts = predPtsByUser.get(uid) ?? 0;
    const cardPts = cardEffectByUser.get(uid) ?? 0;
    return {
      uid,
      alias: aliasById.get(uid) ?? '?',
      predPts,
      cardPts,
      total: predPts + cardPts,
    };
  }).sort((a, b) => b.total - a.total);

  ranking.forEach((r, idx) => {
    const cardNote = r.cardPts !== 0 ? ` (${r.cardPts > 0 ? '+' : ''}${r.cardPts} carta)` : '';
    log(`  ${idx + 1}. ${r.alias.padEnd(15)} ${r.total} pts  [${r.predPts} predicción${cardNote}]`);
  });

  log('');
  log('  📖 EFECTOS APLICADOS:');
  log('  💣 la_mina (FakeMina, M0=2-1): FakeLesion predijo 2-1 → 0 pts en M0');
  log('  🟥 la_roja (FakeRoja→FakeMina, M1): FakeMina pierde puntos de M1 aunque acertase');
  log('  🩹 la_lesion (FakeLesion→FakeDoblete, M2): FakeDoblete tenía doblete → se anulan');
  log('  ⚡ el_doblete (FakeDoblete, M2): doblete en M2 + lesion → cancelados → base sin cambios');
  log('  🚌 el_autobus (FakeAutobus, M3): predijo 0-0 en 1-1 → 0pts pero immune → 1pt mín');
  log('  🎙️  rueda_prensa (FakeRueda→FakeMela, M4): card registrada (efecto pendiente en scoring)');
  log('  📣 la_aficion (FakeAficion→FakeDoblete): bonus = mitad de pts de FakeDoblete si en podio');
  log('  🎲 me_la_juego (FakeMela, M4=1-1): predijo 1-1 ✓ → gana 3pts extra (CardEffect)');
  log('  📹 el_var (FakeVar→FakeRoja, M1): cambia predicción 1-0→2-0 en partido 1-0 → pierde 3pts');
  log('═══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
