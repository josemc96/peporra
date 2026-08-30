import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { PenaltyConfig } from '../models/PenaltyConfig';
import { MatchdayPenalty } from '../models/MatchdayPenalty';
import { Group } from '../models/Group';

// Returns matchday points per user for a given group+season+matchday
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
  if (!predictions.length) return totals;

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

  return totals;
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

      // Sort ascending (worst first) — empates quedan contiguos tras ordenar por puntos.
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
