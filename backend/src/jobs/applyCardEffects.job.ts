import { Types } from 'mongoose';
import { Group } from '../models/Group';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { CardConfig } from '../models/CardConfig';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { CardEffect } from '../models/CardEffect';
import { CardKey } from '../types/enums';

// ── types ──────────────────────────────────────────────────────────────────

interface MatchEffects {
  autobusUsers: Set<string>;
  espejoUsers: Set<string>;
  minaPlays: Array<{ ownerId: string; home: number; away: number }>;
  rojaPlays: Array<{ ownerId: string; targetId: string }>;
  lesionPlays: Array<{ ownerId: string; targetId: string }>;
  dobleUsers: Set<string>;
  melaJuegoPlays: Array<{ userId: string; matchId: string; amount: number }>;
}

interface AficionPlay {
  supporterId: string;
  targetId: string;
}

interface DuplaPlay {
  userA: string;
  userB: string;
}

interface RetoPlay {
  challengerId: string;
  targetId: string;
  accepted?: boolean;
}

// ── helpers ────────────────────────────────────────────────────────────────

async function loadMatchdayCardPlays(
  groupId: Types.ObjectId,
  season: string,
  matchday: number
): Promise<{
  matchEffects: Map<string, MatchEffects>;
  aficionPlays: AficionPlay[];
  duplaPlays: DuplaPlay[];
  retoPlays: RetoPlay[];
}> {

  const deals = await CardDeal.find({ group: groupId, season, matchday, status: 'played' });
  const dealIds = deals.map((d) => d._id);
  const dealMap = new Map(deals.map((d) => [d._id.toString(), d]));

  const plays = await CardPlay.find({ deal: { $in: dealIds } });

  const matchEffects = new Map<string, MatchEffects>();
  const aficionPlays: AficionPlay[] = [];
  const duplaPlays: DuplaPlay[] = [];
  const retoPlays: RetoPlay[] = [];

  function getMatchEffects(matchId: string): MatchEffects {
    if (!matchEffects.has(matchId)) {
      matchEffects.set(matchId, {
        autobusUsers: new Set(),
        espejoUsers: new Set(),
        minaPlays: [],
        rojaPlays: [],
        lesionPlays: [],
        dobleUsers: new Set(),
        melaJuegoPlays: [],
      });
    }
    return matchEffects.get(matchId)!;
  }

  for (const play of plays) {
    const deal = dealMap.get(play.deal.toString());
    if (!deal) continue;
    const card = deal.card as CardKey;
    const userId = deal.user.toString();
    const matchId = play.targetMatch?.toString();

    switch (card) {
      case 'el_autobus':
        if (matchId) getMatchEffects(matchId).autobusUsers.add(userId);
        break;
      case 'espejo':
        if (matchId) getMatchEffects(matchId).espejoUsers.add(userId);
        break;
      case 'la_mina': {
        if (!matchId) break;
        // Need the owner's prediction for that match to know the "dangerous" score
        // We'll resolve this lazily when processing
        const effects = getMatchEffects(matchId);
        effects.minaPlays.push({ ownerId: userId, home: -1, away: -1 }); // scores resolved below
        break;
      }
      case 'la_roja':
        if (matchId && play.targetUser) {
          getMatchEffects(matchId).rojaPlays.push({ ownerId: userId, targetId: play.targetUser.toString() });
        }
        break;
      case 'la_lesion':
        if (matchId && play.targetUser) {
          getMatchEffects(matchId).lesionPlays.push({ ownerId: userId, targetId: play.targetUser.toString() });
        }
        break;
      case 'el_doblete':
        if (matchId) getMatchEffects(matchId).dobleUsers.add(userId);
        break;
      case 'me_la_juego':
        if (matchId && play.params?.amount != null) {
          getMatchEffects(matchId).melaJuegoPlays.push({ userId, matchId, amount: play.params.amount as number });
        }
        break;
      case 'la_aficion':
        if (play.targetUser) {
          aficionPlays.push({ supporterId: userId, targetId: play.targetUser.toString() });
        }
        break;
      case 'dupla':
        if (play.targetUser && play.params?.secondUserId) {
          duplaPlays.push({ userA: play.targetUser.toString(), userB: play.params.secondUserId as string });
        }
        break;
      case 'reto':
        if (play.targetUser) {
          retoPlays.push({
            challengerId: userId,
            targetId: play.targetUser.toString(),
            accepted: play.params?.retoAccepted,
          });
        }
        break;
    }
  }

  return { matchEffects, aficionPlays, duplaPlays, retoPlays };
}

// Resolve mina "dangerous" scores from actual predictions
async function resolveMinas(
  minaPlays: Array<{ ownerId: string; home: number; away: number }>,
  matchId: string
): Promise<void> {
  for (const mina of minaPlays) {
    const pred = await Prediction.findOne({ user: mina.ownerId, match: matchId });
    if (pred) { mina.home = pred.predictedHome; mina.away = pred.predictedAway; }
  }
}

// ── per-match card effect application ─────────────────────────────────────

async function applyMatchEffects(
  groupId: Types.ObjectId,
  match: InstanceType<typeof Match>,
  effects: MatchEffects
): Promise<void> {

  await resolveMinas(effects.minaPlays, match._id.toString());

  // Load all predictions for this match from group members
  const group = await Group.findById(groupId).select('members');
  if (!group) return;
  const memberIds = group.members.map((m) => m.toString());

  const predictions = await Prediction.find({
    match: match._id,
    user: { $in: memberIds },
  }).select('_id user predictedHome predictedAway');

  // ── Paso 1: resolver reflejos de Espejo ──────────────────────────────────
  // Espejo protege del todo (a diferencia de El Autobús, sin el +1 garantizado) y además
  // devuelve el golpe a quien lo lanzó, sobre SU propio resultado en este mismo partido —
  // si el atacante no predijo este partido, el reflejo no tiene nada que penalizar, pero
  // el protegido igualmente se libra.
  const reflectedZero = new Set<string>();
  const reflectedHalf = new Set<string>();

  for (const { ownerId, targetId } of effects.rojaPlays) {
    if (effects.espejoUsers.has(targetId)) reflectedZero.add(ownerId);
  }
  for (const { ownerId, targetId } of effects.lesionPlays) {
    if (effects.espejoUsers.has(targetId)) reflectedHalf.add(ownerId);
  }
  for (const pred of predictions) {
    const userId = pred.user.toString();
    if (!effects.espejoUsers.has(userId)) continue;
    for (const mina of effects.minaPlays) {
      const hits =
        mina.ownerId !== userId &&
        mina.home >= 0 &&
        mina.home === pred.predictedHome &&
        mina.away === pred.predictedAway &&
        mina.home === match.homeScore! &&
        mina.away === match.awayScore!;
      if (hits) reflectedZero.add(mina.ownerId);
    }
  }

  // ── Paso 2: puntos finales de cada predicción ────────────────────────────
  for (const pred of predictions) {
    const userId = pred.user.toString();

    const score = await PredictionScore.findOne({ prediction: pred._id, group: groupId });
    if (!score) continue;

    const preCard = score.preCardPoints;
    let finalPoints = preCard;

    if (effects.espejoUsers.has(userId)) {
      // Protección total — el golpe ya se reflejó arriba hacia quien lo lanzó.
      finalPoints = preCard;
    } else if (effects.autobusUsers.has(userId)) {
      // Immune + guaranteed 1 pt minimum
      finalPoints = Math.max(preCard, 1);
    } else {
      // Mina only explodes if the owner's prediction matched the real result
      const hitByMina = effects.minaPlays.some(
        (m) =>
          m.ownerId !== userId &&
          m.home >= 0 &&
          m.home === pred.predictedHome &&
          m.away === pred.predictedAway &&
          m.home === match.homeScore! &&
          m.away === match.awayScore!
      );

      const hitByRoja = effects.rojaPlays.some((p) => p.targetId === userId) || reflectedZero.has(userId);
      const hitByLesion = effects.lesionPlays.some((p) => p.targetId === userId) || reflectedHalf.has(userId);
      const hasDoble = effects.dobleUsers.has(userId);

      if (hitByRoja || hitByMina) {
        // 0 pts — max damage (Roja, Mina y los reflejos de Espejo resultan en 0)
        finalPoints = 0;
      } else if (hitByLesion && hasDoble) {
        // Cancel each other out → preCardPoints unchanged
        finalPoints = preCard;
      } else if (hitByLesion) {
        finalPoints = Math.floor(preCard / 2);
      } else if (hasDoble) {
        finalPoints = preCard * 2;
      }
    }

    if (finalPoints !== score.points) {
      score.points = finalPoints;
      await score.save();
    }
  }
}

// ── Me la Juego resolution ─────────────────────────────────────────────────

async function processMelaJuego(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  matches: InstanceType<typeof Match>[],
  melaJuegoPlays: Array<{ userId: string; matchId: string; amount: number }>
): Promise<void> {

  const matchMap = new Map(matches.map((m) => [m._id.toString(), m]));

  for (const play of melaJuegoPlays) {
    const match = matchMap.get(play.matchId);
    if (!match || match.status !== 'finished') continue;

    const pred = await Prediction.findOne({ user: play.userId, match: play.matchId });
    if (!pred) continue;

    const claved = pred.predictedHome === match.homeScore && pred.predictedAway === match.awayScore;
    const points = claved ? play.amount : -Math.floor(play.amount / 2);

    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: play.userId, card: 'me_la_juego' },
      { group: groupId, season, matchday, user: new Types.ObjectId(play.userId), card: 'me_la_juego', points, sourceMatch: new Types.ObjectId(play.matchId) },
      { upsert: true }
    );
  }
}

// ── Puntos de jornada por usuario (PredictionScore ya post-efectos de partido) ──────────
// Compartido entre La Afición (necesita el podio) y Dupla (necesita la media de 2).

async function computeMatchdayPredictionPoints(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[]
): Promise<Map<string, number> | null> {
  const matchIds = (await Match.find({ competition: 'la_liga', season, matchday }).select('_id')).map((m) => m._id);
  if (!matchIds.length) return null;

  const predictions = await Prediction.find({ match: { $in: matchIds }, user: { $in: memberIds } }).select('_id user');
  const predIdsByUser = new Map<string, Types.ObjectId[]>();
  for (const p of predictions) {
    const uid = p.user.toString();
    if (!predIdsByUser.has(uid)) predIdsByUser.set(uid, []);
    predIdsByUser.get(uid)!.push(p._id as Types.ObjectId);
  }

  const matchdayPoints = new Map<string, number>(memberIds.map((id) => [id, 0]));
  for (const [uid, predIds] of predIdsByUser.entries()) {
    const scores = await PredictionScore.find({ prediction: { $in: predIds }, group: groupId }).select('points');
    matchdayPoints.set(uid, scores.reduce((s, sc) => s + sc.points, 0));
  }

  return matchdayPoints;
}

// ── La Afición resolution ──────────────────────────────────────────────────

async function processLaAficion(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[],
  aficionPlays: AficionPlay[]
): Promise<void> {
  if (aficionPlays.length === 0) return;

  const matchdayPoints = await computeMatchdayPredictionPoints(groupId, season, matchday, memberIds);
  if (!matchdayPoints) return;

  const sorted = [...matchdayPoints.entries()].sort((a, b) => b[1] - a[1]);
  const podium = new Set(sorted.slice(0, 3).map(([uid]) => uid));

  for (const { supporterId, targetId } of aficionPlays) {
    if (!podium.has(targetId)) continue;
    const targetPts = matchdayPoints.get(targetId) ?? 0;
    const bonus = Math.floor(targetPts / 2);
    if (bonus <= 0) continue;

    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: supporterId, card: 'la_aficion' },
      { group: groupId, season, matchday, user: new Types.ObjectId(supporterId), card: 'la_aficion', points: bonus },
      { upsert: true }
    );
  }
}

// ── Dupla resolution ─────────────────────────────────────────────────────────
// Los 2 jugadores elegidos acaban la jornada con la media de sus puntos — se implementa
// como un ajuste (CardEffect) por cabeza que, sumado a su PredictionScore de la jornada,
// deja a los dos en esa media exacta (puede llevar decimales, no se redondea).

async function processDupla(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[],
  duplaPlays: DuplaPlay[]
): Promise<void> {
  if (duplaPlays.length === 0) return;

  const matchdayPoints = await computeMatchdayPredictionPoints(groupId, season, matchday, memberIds);
  if (!matchdayPoints) return;

  for (const { userA, userB } of duplaPlays) {
    const pointsA = matchdayPoints.get(userA) ?? 0;
    const pointsB = matchdayPoints.get(userB) ?? 0;
    const average = (pointsA + pointsB) / 2;

    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: userA, card: 'dupla' },
      { group: groupId, season, matchday, user: new Types.ObjectId(userA), card: 'dupla', points: average - pointsA },
      { upsert: true }
    );
    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: userB, card: 'dupla' },
      { group: groupId, season, matchday, user: new Types.ObjectId(userB), card: 'dupla', points: average - pointsB },
      { upsert: true }
    );
  }
}

// ── Reto resolution ───────────────────────────────────────────────────────────
// Dos fases, cada una con su propio disparador:
//  1. En cuanto empieza la jornada: retos sin aceptar (rechazados o sin respuesta) hacen
//     que el retado pierda 2 pts, sin dárselos al retador.
//  2. Cuando la jornada termina del todo: retos aceptados comparan puntos de jornada —
//     quien tenga más le quita 4 al otro (empate = nadie gana nada).
// Cuenta como puntuación normal de esa jornada (ranking de jornada Y deuda/bote, ver
// applyMatchdayPenalties.job.ts) — para cuando se reparte la penalización, la jornada ya
// ha terminado del todo y ambas fases de Reto (incluida la de rechazo, disparada antes,
// en el kickoff) ya están resueltas. Se recalcula el total absoluto de cada usuario en
// cada pasada (no se incrementa) para que rerun sea idempotente.

async function processReto(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[],
  retoPlays: RetoPlay[],
  matchdayStarted: boolean,
  matchdayComplete: boolean
): Promise<void> {
  if (retoPlays.length === 0) return;

  const totals = new Map<string, number>();
  const addPoints = (userId: string, delta: number) => totals.set(userId, (totals.get(userId) ?? 0) + delta);

  const acceptedPlays: RetoPlay[] = [];
  for (const play of retoPlays) {
    if (play.accepted === true) {
      acceptedPlays.push(play);
    } else if (matchdayStarted) {
      addPoints(play.targetId, -2);
    }
  }

  if (acceptedPlays.length > 0 && matchdayComplete) {
    const matchdayPoints = await computeMatchdayPredictionPoints(groupId, season, matchday, memberIds);
    if (matchdayPoints) {
      for (const { challengerId, targetId } of acceptedPlays) {
        const challengerPts = matchdayPoints.get(challengerId) ?? 0;
        const targetPts = matchdayPoints.get(targetId) ?? 0;
        if (challengerPts === targetPts) continue; // empate: nadie le quita puntos a nadie
        const winnerId = challengerPts > targetPts ? challengerId : targetId;
        const loserId = winnerId === challengerId ? targetId : challengerId;
        addPoints(winnerId, 4);
        addPoints(loserId, -4);
      }
    }
  }

  for (const [userId, points] of totals.entries()) {
    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: userId, card: 'reto' },
      { group: groupId, season, matchday, user: new Types.ObjectId(userId), card: 'reto', points },
      { upsert: true }
    );
  }
}

// ── Main job ───────────────────────────────────────────────────────────────

export async function applyCardEffects(season: string): Promise<{ matchdaysProcessed: number }> {
  const groups = await Group.find({ season }).select('_id members season');
  let matchdaysProcessed = 0;

  for (const group of groups) {
    const config = await CardConfig.findOne({ group: group._id, season });
    if (!config || config.enabledCards.length === 0) continue;

    const allMatchdays = await Match.find({ competition: 'la_liga', season, matchday: { $ne: null } })
      .select('matchday status startTime');

    // Build matchday status map
    const matchdayStatus = new Map<number, { total: number; finished: number }>();
    const matchdayEarliestStart = new Map<number, Date>();
    for (const m of allMatchdays) {
      const day = m.matchday!;
      const entry = matchdayStatus.get(day) ?? { total: 0, finished: 0 };
      entry.total++;
      if (m.status === 'finished') entry.finished++;
      matchdayStatus.set(day, entry);

      const cur = matchdayEarliestStart.get(day);
      if (!cur || m.startTime < cur) matchdayEarliestStart.set(day, m.startTime);
    }

    // Matchdays with at least one finished match (for match-level cards)
    const matchdaysWithFinished = [...matchdayStatus.entries()]
      .filter(([, s]) => s.finished > 0)
      .map(([day]) => day);

    // Matchdays fully finished (required for La Afición/Dupla, que necesitan el ranking
    // de jornada completo, y para la fase de "gana/pierde" de Reto)
    const completedMatchdays = new Set(
      [...matchdayStatus.entries()]
        .filter(([, s]) => s.total > 0 && s.total === s.finished)
        .map(([day]) => day)
    );

    // Matchdays ya empezadas (kickoff del primer partido ya pasado) — Reto necesita
    // detectar esto ANTES de que termine ningún partido, para penalizar los retos sin
    // aceptar en cuanto arranca la jornada, no cuando el primer partido termina.
    const now = new Date();
    const matchdaysStarted = new Set(
      [...matchdayEarliestStart.entries()]
        .filter(([, start]) => now >= start)
        .map(([day]) => day)
    );

    const matchdaysToProcess = [...new Set([...matchdaysWithFinished, ...matchdaysStarted])];

    for (const matchday of matchdaysToProcess) {
      const matches = await Match.find({ competition: 'la_liga', season, matchday, status: 'finished' });
      const { matchEffects, aficionPlays, duplaPlays, retoPlays } = await loadMatchdayCardPlays(group._id as Types.ObjectId, season, matchday);

      // Match-level effects (Mina, Roja, Lesión, Autobús, Doblete) — applied as each match finishes
      for (const match of matches) {
        const effects = matchEffects.get(match._id.toString());
        if (!effects) continue;
        await applyMatchEffects(group._id as Types.ObjectId, match, effects);
      }

      // Me la Juego resolves per-match, also doesn't need full matchday
      const allMelaJuego = [...matchEffects.values()].flatMap((e) => e.melaJuegoPlays);
      await processMelaJuego(group._id as Types.ObjectId, season, matchday, matches, allMelaJuego);

      // La Afición y Dupla necesitan el ranking de jornada ya completo (post-efectos), así
      // que solo se resuelven cuando la jornada ha terminado del todo.
      const memberIds = group.members.map((m) => m.toString());
      if (completedMatchdays.has(matchday)) {
        await processLaAficion(group._id as Types.ObjectId, season, matchday, memberIds, aficionPlays);
        await processDupla(group._id as Types.ObjectId, season, matchday, memberIds, duplaPlays);
        matchdaysProcessed++;
      }

      // Reto tiene sus dos fases gestionadas dentro de processReto (timeout en cuanto
      // empieza, gana/pierde cuando termina) — se llama siempre que haya jugadas de reto.
      await processReto(
        group._id as Types.ObjectId, season, matchday, memberIds, retoPlays,
        matchdaysStarted.has(matchday), completedMatchdays.has(matchday)
      );
    }
  }

  return { matchdaysProcessed };
}
