/**
 * seedMockCards.ts
 *
 * Crea una jornada falsa (J99) que empieza en ~1 hora para testear el sistema de cartas.
 * Ejecutar: npm run seed:mock-cards
 *
 * Lo que crea:
 *  - 10 usuarios falsos (fake_*.cards@test.com)
 *  - Un grupo "Peña Mock Cartas" con el usuario real como admin y todos los falsos como miembros
 *  - 5 partidos de La Liga J99 que empiezan en ~1 hora
 *  - Predicciones para todos los usuarios
 *  - GroupRuleSettings con exact_score y correct_sign activos
 *  - CardConfig con las 10 cartas habilitadas
 *  - CardDeals asignados (1 carta específica por usuario)
 *  - CardPlays pre-jugados para los usuarios falsos que pueden jugar ahora
 *    (el_var y el_espia quedan pendientes — se juegan en finishMockCards.ts)
 *
 * Mañana ejecuta: npm run finish:mock-cards
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { Rule } from '../models/Rule';
import { GroupRuleSettings } from '../models/GroupRuleSettings';
import { CardConfig } from '../models/CardConfig';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { ALL_CARD_KEYS, CardKey } from '../types/enums';

// ── Config ─────────────────────────────────────────────────────────────────

const REAL_USER_EMAIL = 'pepe@pepe.com';
const SEASON = '2026-2027';
const MATCHDAY = 99;
const GROUP_NAME = 'Peña Mock Cartas';
const PASSWORD = 'test1234';

// ── Datos escenario ────────────────────────────────────────────────────────

// Resultados reales mañana (match index, homeScore, awayScore)
// Match 0: Real Madrid vs Barcelona → 2-1
// Match 1: Atletico vs Sevilla → 1-0
// Match 2: Valencia vs Villarreal → 2-2
// Match 3: Betis vs Getafe → 1-1
// Match 4: Osasuna vs Mallorca → 1-1

const FAKE_USERS: Array<{ alias: string; email: string; card: CardKey }> = [
  { alias: 'FakeMina',     email: 'fake.mina.cards@test.com',     card: 'la_mina'     },
  { alias: 'FakeRoja',     email: 'fake.roja.cards@test.com',     card: 'la_roja'     },
  { alias: 'FakeLesion',   email: 'fake.lesion.cards@test.com',   card: 'la_lesion'   },
  { alias: 'FakeVar',      email: 'fake.var.cards@test.com',      card: 'el_var'      },
  { alias: 'FakeAutobus',  email: 'fake.autobus.cards@test.com',  card: 'el_autobus'  },
  { alias: 'FakeEspia',    email: 'fake.espia.cards@test.com',    card: 'el_espia'    },
  { alias: 'FakeRueda',    email: 'fake.rueda.cards@test.com',    card: 'rueda_prensa'},
  { alias: 'FakeAficion',  email: 'fake.aficion.cards@test.com',  card: 'la_aficion'  },
  { alias: 'FakeDoblete',  email: 'fake.doblete.cards@test.com',  card: 'el_doblete'  },
  { alias: 'FakeMela',     email: 'fake.mela.cards@test.com',     card: 'me_la_juego' },
];

// El usuario real recibe un el_doblete de regalo para jugar hoy
const REAL_USER_CARD: CardKey = 'el_doblete';

// Predicciones por usuario [h, a] para cada partido [0..4]
// Resultados reales: [2-1, 1-0, 2-2, 1-1, 1-1]
const PREDICTIONS: Record<string, Array<[number, number]>> = {
  FakeMina:    [[2,1], [1,0], [1,0], [0,0], [0,0]],  // Mina planta 2-1 en M0
  FakeRoja:    [[3,0], [1,0], [2,2], [0,0], [1,1]],  // VAR le cambia M1: 1-0→2-0
  FakeLesion:  [[2,1], [0,0], [2,2], [1,1], [1,1]],  // 2-1 en M0 → pisa mina → 0pts
  FakeVar:     [[0,0], [0,0], [1,1], [1,1], [2,0]],  // usa VAR mañana
  FakeAutobus: [[0,1], [0,1], [0,1], [0,0], [0,1]],  // autobus en M3 → mín 1pt
  FakeEspia:   [[1,0], [1,0], [1,1], [1,1], [0,0]],  // carta queda pendiente
  FakeRueda:   [[1,0], [1,0], [2,2], [1,1], [0,1]],  // rueda en FakeMela M4
  FakeAficion: [[1,0], [1,0], [0,0], [1,1], [1,1]],  // apoya a FakeDoblete
  FakeDoblete: [[3,1], [1,0], [2,2], [1,1], [0,1]],  // doblete en M2 + lesion → se anulan
  FakeMela:    [[0,0], [0,1], [2,2], [0,0], [1,1]],  // apuesta 3pts en M4
};
// Real user: juega hoy su el_doblete en el partido que quiera
const REAL_USER_PREDS: Array<[number, number]> = [[1,0], [1,0], [2,2], [1,1], [1,1]];

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[seedMockCards] ${msg}`); }

async function main() {
  await connectDB();
  log('Conectado a MongoDB');

  const hashedPwd = await bcrypt.hash(PASSWORD, 10);

  // 1. Usuario real
  const realUser = await User.findOne({ email: REAL_USER_EMAIL });
  if (!realUser) {
    console.error(`No se encontró el usuario real (${REAL_USER_EMAIL}). Asegúrate de estar registrado.`);
    process.exit(1);
  }
  log(`Usuario real: ${realUser.alias} (${realUser._id})`);

  // 2. Usuarios falsos
  const fakeUserMap = new Map<string, Types.ObjectId>(); // alias → _id
  for (const fu of FAKE_USERS) {
    let u = await User.findOne({ email: fu.email });
    if (!u) {
      u = await User.create({ alias: fu.alias, email: fu.email, password: hashedPwd, role: 'user' });
      log(`Usuario creado: ${fu.alias}`);
    } else {
      log(`Usuario existía: ${fu.alias}`);
    }
    fakeUserMap.set(fu.alias, u._id as Types.ObjectId);
  }

  // 3. Grupo
  const allMemberIds = [
    realUser._id as Types.ObjectId,
    ...Array.from(fakeUserMap.values()),
  ];

  let group = await Group.findOne({ name: GROUP_NAME, season: SEASON });
  if (!group) {
    group = await Group.create({
      name: GROUP_NAME,
      inviteCode: `MOCK${Date.now().toString(36).toUpperCase().slice(-4)}`,
      admin: realUser._id,
      members: allMemberIds,
      season: SEASON,
    });
    log(`Grupo creado: ${group.name} (${group._id}) — inviteCode: ${group.inviteCode}`);
  } else {
    // Asegurar que todos los miembros están en el grupo
    const existing = new Set(group.members.map((m) => m.toString()));
    for (const id of allMemberIds) {
      if (!existing.has(id.toString())) group.members.push(id);
    }
    await group.save();
    log(`Grupo ya existía: ${group.name} (${group._id}) — inviteCode: ${group.inviteCode}`);
  }

  const groupId = group._id as Types.ObjectId;

  // 4. GroupRuleSettings — activar exact_score y correct_sign
  const allRules = await Rule.find({ scope: 'match' });
  const ruleConfigs = allRules.map((r) => ({
    rule: r._id as Types.ObjectId,
    points: r.defaultPoints,
    active: r.key === 'exact_score' || r.key === 'correct_sign',
  }));
  await GroupRuleSettings.findOneAndUpdate(
    { group: groupId, season: SEASON },
    { $set: { rules: ruleConfigs, enabledCompetitions: [], enabledFeatures: [] } },
    { upsert: true }
  );
  log('GroupRuleSettings actualizado (exact_score=3pts, correct_sign=1pt, ambos activos)');

  // 5. CardConfig — las 10 cartas habilitadas
  await CardConfig.findOneAndUpdate(
    { group: groupId, season: SEASON },
    { $set: { enabledCards: ALL_CARD_KEYS, melaJuegoLimit: 5 } },
    { upsert: true }
  );
  log('CardConfig creado (las 10 cartas activas, límite Me la Juego = 5 pts)');

  // 6. Partidos J99 — empiezan en ~1h a partir de ahora
  const startBase = new Date(Date.now() + 60 * 60 * 1000); // 1 hora desde ahora
  const matchFixtures = [
    { homeTeam: 'Real Madrid', awayTeam: 'Barcelona' },
    { homeTeam: 'Atletico',    awayTeam: 'Sevilla'   },
    { homeTeam: 'Valencia',    awayTeam: 'Villarreal' },
    { homeTeam: 'Betis',       awayTeam: 'Getafe'    },
    { homeTeam: 'Osasuna',     awayTeam: 'Mallorca'  },
  ];

  const matchDocs: Array<InstanceType<typeof Match>> = [];
  for (let i = 0; i < matchFixtures.length; i++) {
    const f = matchFixtures[i];
    const startTime = new Date(startBase.getTime() + i * 5 * 60 * 1000); // +5 min entre partidos
    const m = await Match.findOneAndUpdate(
      { season: SEASON, competition: 'la_liga', matchday: MATCHDAY, homeTeam: f.homeTeam, awayTeam: f.awayTeam },
      { $setOnInsert: { season: SEASON, competition: 'la_liga', matchday: MATCHDAY, isKnockout: false, homeTeam: f.homeTeam, awayTeam: f.awayTeam, startTime, status: 'pending' } },
      { upsert: true, new: true }
    );
    matchDocs.push(m!);
    log(`Partido ${i}: ${f.homeTeam} vs ${f.awayTeam} — empieza ${startTime.toLocaleString('es-ES')}`);
  }

  // 7. Predicciones
  const aliasToId = (alias: string): Types.ObjectId => fakeUserMap.get(alias)!;

  async function upsertPred(userId: Types.ObjectId, matchIdx: number, h: number, a: number) {
    const match = matchDocs[matchIdx];
    await Prediction.findOneAndUpdate(
      { user: userId, match: match._id },
      { $set: { user: userId, match: match._id, predictedHome: h, predictedAway: a, status: 'pending' } },
      { upsert: true }
    );
  }

  // Fake users
  for (const fu of FAKE_USERS) {
    const preds = PREDICTIONS[fu.alias];
    const uid = aliasToId(fu.alias);
    for (let i = 0; i < preds.length; i++) {
      await upsertPred(uid, i, preds[i][0], preds[i][1]);
    }
  }
  // Real user
  for (let i = 0; i < REAL_USER_PREDS.length; i++) {
    await upsertPred(realUser._id as Types.ObjectId, i, REAL_USER_PREDS[i][0], REAL_USER_PREDS[i][1]);
  }
  log('Predicciones creadas para todos los usuarios');

  // 8. CardDeals — uno por usuario con la carta asignada
  async function upsertDeal(userId: Types.ObjectId, card: CardKey, status: 'pending' | 'played' = 'pending') {
    return CardDeal.findOneAndUpdate(
      { group: groupId, season: SEASON, matchday: MATCHDAY, user: userId },
      { $setOnInsert: { group: groupId, season: SEASON, matchday: MATCHDAY, user: userId, card, status, dealtAt: new Date() } },
      { upsert: true, new: true }
    );
  }

  const dealMap = new Map<string, InstanceType<typeof CardDeal>>(); // alias → deal
  for (const fu of FAKE_USERS) {
    const deal = await upsertDeal(aliasToId(fu.alias), fu.card);
    dealMap.set(fu.alias, deal!);
    log(`Deal: ${fu.alias} → ${fu.card}`);
  }
  // Real user
  const realDeal = await upsertDeal(realUser._id as Types.ObjectId, REAL_USER_CARD);
  log(`Deal: ${realUser.alias} (tú) → ${REAL_USER_CARD} [PENDIENTE — juégala hoy antes de que empiece la jornada]`);

  // 9. CardPlays pre-jugados (sólo los que se pueden jugar antes del kickoff)
  // SKIPS: el_var (necesita partido terminado), el_espia (ventana -30min)

  async function play(alias: string, extra: Record<string, unknown>) {
    const deal = dealMap.get(alias)!;
    const exists = await CardPlay.findOne({ deal: deal._id });
    if (exists) { log(`Play ${alias}: ya existía`); return; }
    await CardPlay.create({ deal: deal._id, ...extra });
    await CardDeal.findByIdAndUpdate(deal._id, { status: 'played' });
    log(`Play ${alias} (${deal.card}) ✓`);
  }

  const m0 = matchDocs[0]._id; // Real Madrid vs Barcelona
  const m1 = matchDocs[1]._id; // Atletico vs Sevilla
  const m2 = matchDocs[2]._id; // Valencia vs Villarreal
  const m3 = matchDocs[3]._id; // Betis vs Getafe
  const m4 = matchDocs[4]._id; // Osasuna vs Mallorca

  // la_mina → FakeMina planta mina en M0 (su predicción 2-1 es el resultado exacto)
  await play('FakeMina', { targetMatch: m0, params: {} });

  // la_roja → FakeRoja apunta a FakeMina en M1 (FakeMina pierde los puntos de M1)
  await play('FakeRoja', { targetUser: aliasToId('FakeMina'), targetMatch: m1, params: {} });

  // la_lesion → FakeLesion apunta a FakeDoblete en M2 (FakeDoblete tendrá la mitad... pero también tiene doblete → se anulan)
  await play('FakeLesion', { targetUser: aliasToId('FakeDoblete'), targetMatch: m2, params: {} });

  // el_autobus → FakeAutobus se protege en M3 (predice 0-0, resultado 1-1 → 0 pts PERO immune → mín 1pt)
  await play('FakeAutobus', { targetMatch: m3, params: {} });

  // rueda_prensa → FakeRueda añade puntos a FakeMela en M4
  // (efecto pendiente de implementar en scoring, pero la carta se juega)
  await play('FakeRueda', { targetUser: aliasToId('FakeMela'), targetMatch: m4, params: {} });

  // la_aficion → FakeAficion apoya a FakeDoblete (si FakeDoblete acaba en podio, FakeAficion gana la mitad de sus pts)
  await play('FakeAficion', { targetUser: aliasToId('FakeDoblete'), params: {} });

  // el_doblete → FakeDoblete dobla sus puntos en M2 (Valencia vs Villarreal, predice 2-2 = exacto)
  // Combinado con la lesion → se anulan → puntuación base sin cambios
  await play('FakeDoblete', { targetMatch: m2, params: {} });

  // me_la_juego → FakeMela apuesta 3pts en M4 (Osasuna vs Mallorca, predice 1-1 = exacto → gana)
  await play('FakeMela', { targetMatch: m4, params: { amount: 3 } });

  // PENDIENTES (no pre-jugados):
  // FakeVar (el_var) → necesita partido terminado → lo juegas mañana desde finishMockCards.ts
  // FakeEspia (el_espia) → ventana -30min antes del partido → la puedes probar tú en la app

  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('✅  MOCK J99 CREADO CORRECTAMENTE');
  log('═══════════════════════════════════════════════════════════════');
  log(`  Grupo:      "${GROUP_NAME}" — inviteCode: ${group.inviteCode}`);
  log(`  Tu carta:   ${REAL_USER_CARD} (⚡ el_doblete) — PENDIENTE`);
  log(`  Jornada:    J99 — empieza en ~1 hora`);
  log('');
  log('  ┌─ Escenario de cartas ──────────────────────────────────┐');
  log('  │  💣 FakeMina    → la_mina en M0 (2-1 peligroso)       │');
  log('  │  🟥 FakeRoja    → la_roja sobre FakeMina en M1        │');
  log('  │  🩹 FakeLesion  → la_lesion sobre FakeDoblete en M2   │');
  log('  │  📹 FakeVar     → el_var PENDIENTE (juega mañana)     │');
  log('  │  🚌 FakeAutobus → el_autobus en M3 (inmune)           │');
  log('  │  🕵️  FakeEspia   → el_espia PENDIENTE (prueba en app)  │');
  log('  │  🎙️  FakeRueda   → rueda_prensa sobre FakeMela en M4   │');
  log('  │  📣 FakeAficion → la_aficion apoya a FakeDoblete      │');
  log('  │  ⚡ FakeDoblete → el_doblete en M2 (+ lesion → cancel)│');
  log('  │  🎲 FakeMela    → me_la_juego 3pts en M4              │');
  log('  │  ⚡ TÚ          → el_doblete PENDIENTE (juega hoy!)   │');
  log('  └────────────────────────────────────────────────────────┘');
  log('');
  log('  Resultados mañana (M0:2-1, M1:1-0, M2:2-2, M3:1-1, M4:1-1)');
  log('  Mañana ejecuta: npm run finish:mock-cards');
  log('═══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
