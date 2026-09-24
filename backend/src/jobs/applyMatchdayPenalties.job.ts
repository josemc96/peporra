import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { PenaltyConfig } from '../models/PenaltyConfig';
import { MatchdayPenalty } from '../models/MatchdayPenalty';
import { CardEffect } from '../models/CardEffect';
import { Group } from '../models/Group';

// Returns matchday points per user for a given group+season+matchday — igual que el
// ranking de jornada (penaltyConfig.controller.ts getMatchdayRanking): predicciones +
// efectos de cartas de esa jornada (La Afición, Dupla, Me la Juego, Reto...). Así el bote
// reparte en base a los MISMOS puntos que ve el usuario en el ranking de esa jornada.
// Esta función solo se llama una vez la jornada está completa (ver isMatchdayComplete),
// así que para entonces todos los efectos de cartas de esa jornada ya están resueltos.
async function computeMatchdayPoints(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>(memberIds.map((id) => [id, 0]));

  const matches = await Match.find({ competition: 'la_liga', season, matchday }).select('_id');
  if (!matches.length) return totals;

  const matchIds = matches.map((m) => m._id);
  const predictions = await Prediction.find({ match: { $in: matchIds } }).select('_id user');
  if (predictions.length) {
    const predUserMap = new Map(predictions.map((p) => [p._id.toString(), p.user.toString()]));
    const scores = await PredictionScore.find({
      group: groupId,
      prediction: { $in: predictions.map((p) => p._id) },
    }).select('prediction points');

    for (const score of scores) {
      const userId = predUserMap.get(score.prediction.toString());
      if (userId && totals.has(userId)) {
        totals.set(userId, (totals.get(userId) ?? 0) + score.points);
      }
    }
  }

  const cardEffects = await CardEffect.find({ group: groupId, season, matchday }).select('user points');
  for (const effect of cardEffects) {
    const userId = effect.user.toString();
    if (totals.has(userId)) {
      totals.set(userId, (totals.get(userId) ?? 0) + effect.points);
    }
  }

  return totals;
}

// Cuántos partidos de La Liga de la jornada le faltan por predecir a cada miembro, en ESTE
// grupo (una predicción hecha en otra peña no cuenta aquí — cada peña es independiente).
async function computeMissingCounts(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[]
): Promise<Map<string, number>> {
  const matches = await Match.find({ competition: 'la_liga', season, matchday }).select('_id');
  const totalMatches = matches.length;
  const matchIds = matches.map((m) => m._id);

  const predictions = await Prediction.find({ group: groupId, match: { $in: matchIds }, user: { $in: memberIds } })
    .select('user');
  const predictedCounts = new Map<string, number>();
  for (const p of predictions) {
    const uid = p.user.toString();
    predictedCounts.set(uid, (predictedCounts.get(uid) ?? 0) + 1);
  }

  const missing = new Map<string, number>();
  for (const id of memberIds) {
    missing.set(id, totalMatches - (predictedCounts.get(id) ?? 0));
  }
  return missing;
}

// Checks if all La Liga matches of a matchday are finished and all predictions scored
async function isMatchdayComplete(season: string, matchday: number): Promise<boolean> {
  const matches = await Match.find({ competition: 'la_liga', season, matchday }).select('_id status');
  if (!matches.length) return false;

  const allFinished = matches.every((m) => m.status === 'finished');
  if (!allFinished) return false;

  const matchIds = matches.map((m) => m._id);
  const pendingPredictions = await Prediction.countDocuments({
    match: { $in: matchIds },
    status: 'pending',
  });

  return pendingPredictions === 0;
}

export async function applyMatchdayPenalties(groupIdFilter?: Types.ObjectId): Promise<void> {
  const configFilter = groupIdFilter ? { group: groupIdFilter } : {};
  const configs = await PenaltyConfig.find(configFilter);
  if (!configs.length) return;

  for (const config of configs) {
    if (!config.penalties.length) continue;

    const group = await Group.findById(config.group).select('members');
    if (!group) continue;

    const memberIds = group.members.map((m) => m.toString());

    // Find all La Liga matchdays for this season
    const matchdays = await Match.distinct('matchday', {
      competition: 'la_liga',
      season: config.season,
      matchday: { $ne: null },
    }) as number[];

    for (const matchday of matchdays) {
      // Skip if already applied for this group+season+matchday
      const existing = await MatchdayPenalty.findOne({
        group: config.group,
        season: config.season,
        matchday,
      });
      if (existing) continue;

      if (!(await isMatchdayComplete(config.season, matchday))) continue;

      const points = await computeMatchdayPoints(config.group as Types.ObjectId, config.season, matchday, memberIds);

      // Quien no predijo missingPredictionsThreshold partidos o más de la jornada queda
      // fuera del ranking de posiciones: paga un importe fijo aparte y no cuenta para las
      // posiciones (ni las "corre" hacia arriba) del resto de la peña.
      if (config.missingPredictionsAmount > 0) {
        const missingCounts = await computeMissingCounts(
          config.group as Types.ObjectId, config.season, matchday, memberIds
        );
        for (const [userId, missing] of missingCounts.entries()) {
          if (missing < config.missingPredictionsThreshold) continue;
          await MatchdayPenalty.findOneAndUpdate(
            { group: config.group, season: config.season, matchday, user: userId },
            { group: config.group, season: config.season, matchday, user: userId, position: 0, amount: config.missingPredictionsAmount },
            { upsert: true }
          );
          points.delete(userId);
        }
      }

      // Sort ascending (worst first) — empates quedan contiguos tras ordenar por puntos.
      // Solo entran aquí quienes SÍ predijeron lo suficiente (points.delete arriba).
      const ranked = Array.from(points.entries()).sort((a, b) => a[1] - b[1]);

      const amountByPosition = new Map(config.penalties.map((p) => [p.position, p.amount]));
      const maxPosition = Math.max(...config.penalties.map((p) => p.position));

      // Se agrupan los empates: todo el bloque empatado ocupa varias posiciones a la vez
      // (ej. 4 personas empatadas a la peor puntuación ocupan las posiciones 2-5) y cobra
      // la penalización MÁS ALTA de entre las posiciones que ocupa en conjunto — nadie del
      // bloque se libra de la penalización más dura solo por cómo caiga el empate.
      let cursor = 0;
      while (cursor < ranked.length) {
        const groupPoints = ranked[cursor][1];
        let end = cursor;
        while (end < ranked.length && ranked[end][1] === groupPoints) end++;

        const startPosition = cursor + 1; // 1 = último puesto
        if (startPosition > maxPosition) break; // ya no quedan posiciones configuradas

        let amount = 0;
        for (let position = startPosition; position <= end; position++) {
          const a = amountByPosition.get(position);
          if (a != null && a > amount) amount = a;
        }

        if (amount > 0) {
          for (let i = cursor; i < end; i++) {
            const [userId] = ranked[i];
            await MatchdayPenalty.findOneAndUpdate(
              { group: config.group, season: config.season, matchday, user: userId },
              { group: config.group, season: config.season, matchday, user: userId, position: startPosition, amount },
              { upsert: true }
            );
          }
        }

        cursor = end;
      }
    }
  }
}
