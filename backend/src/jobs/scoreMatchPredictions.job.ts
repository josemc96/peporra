import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { Group } from '../models/Group';
import { Rule } from '../models/Rule';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { ruleEvaluators } from '../services/rules/registry';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { resolveMultiplier } from '../services/rules/resolveMultiplier';
import { isCompetitionEnabledForGroup } from '../services/competitionEligibility.service';

function varCoversResult(pH: number, pA: number, rH: number, rA: number): boolean {
  if (pH === rH && pA === rA) return false; // already exact, VAR not needed
  if (Math.abs(pH - rH) === 1 && pA === rA) return true;
  if (pH === rH && Math.abs(pA - rA) === 1) return true;
  return false;
}

async function hasVarPlay(userId: Types.ObjectId, groupId: Types.ObjectId, season: string, matchday: number | undefined, matchId: Types.ObjectId): Promise<boolean> {
  if (matchday == null) return false;
  const deal = await CardDeal.findOne({ user: userId, group: groupId, season, matchday, card: 'el_var', status: 'played' });
  if (!deal) return false;
  const play = await CardPlay.findOne({ deal: deal._id, targetMatch: matchId });
  return !!play;
}

export interface ScoreMatchPredictionsResult {
  predictionsScored: number;
  predictionsFailed: number;
}

export async function scoreMatchPredictions(): Promise<ScoreMatchPredictionsResult> {
  const finishedMatches = await Match.find({ status: 'finished' });
  const finishedMatchIds = finishedMatches.map((m) => m._id);
  const matchById = new Map(finishedMatches.map((m) => [m._id.toString(), m]));

  const pendingPredictions = await Prediction.find({ match: { $in: finishedMatchIds }, status: 'pending' });

  const allRules = await Rule.find();
  const ruleIdByKey = new Map(allRules.map((rule) => [rule.key, rule._id as Types.ObjectId]));

  let predictionsScored = 0;
  let predictionsFailed = 0;

  for (const prediction of pendingPredictions) {
    // Aislada por predicción: un registro corrupto (ej. datos de prueba antiguos sin
    // `group`) no puede volver a tumbar la puntuación de todos los demás detrás de él.
    try {
      const match = matchById.get(prediction.match.toString())!;

      const group = prediction.group ? await Group.findById(prediction.group) : null;
      if (!group) {
        prediction.status = 'scored';
        await prediction.save({ validateBeforeSave: false });
        continue;
      }

      const eligible = await isCompetitionEnabledForGroup(group._id as Types.ObjectId, match.season, match.competition);
      if (!eligible) {
        prediction.status = 'scored';
        await prediction.save();
        predictionsScored += 1;
        continue;
      }

      const activeRules = await resolveActiveRules(group._id as Types.ObjectId, match.season, 'match');

      const varActive = await hasVarPlay(
        prediction.user as Types.ObjectId,
        group._id as Types.ObjectId,
        match.season,
        match.matchday,
        match._id as Types.ObjectId,
      );

      const pH = prediction.predictedHome;
      const pA = prediction.predictedAway;
      const rH = match.homeScore!;
      const rA = match.awayScore!;
      // If VAR is active and the prediction misses exact by ±1 on one side, treat as exact
      const effectiveHome = (varActive && varCoversResult(pH, pA, rH, rA)) ? rH : pH;
      const effectiveAway = (varActive && varCoversResult(pH, pA, rH, rA)) ? rA : pA;

      let totalPoints = 0;
      const ruleBreakdown: { rule: Types.ObjectId; points: number }[] = [];

      for (const active of activeRules) {
        const evaluator = ruleEvaluators[active.key];
        const occurrences = evaluator({
          predictedHome: effectiveHome,
          predictedAway: effectiveAway,
          realHome: rH,
          realAway: rA,
        } as never);

        if (occurrences > 0) {
          const rulePoints = occurrences * active.points;
          totalPoints += rulePoints;
          const ruleId = ruleIdByKey.get(active.key);
          if (ruleId) ruleBreakdown.push({ rule: ruleId, points: rulePoints });
        }
      }

      const multiplier = await resolveMultiplier(group._id as Types.ObjectId, match._id as Types.ObjectId, match.matchday);
      const finalPoints = totalPoints * multiplier;

      await PredictionScore.findOneAndUpdate(
        { prediction: prediction._id, group: group._id },
        {
          $set: {
            prediction: prediction._id,
            group: group._id,
            points: finalPoints,
            preCardPoints: finalPoints,
            ruleBreakdown,
            multiplierApplied: multiplier > 1 ? multiplier : undefined,
          },
        },
        { upsert: true }
      );

      prediction.status = 'scored';
      await prediction.save();
      predictionsScored += 1;
    } catch (err) {
      predictionsFailed += 1;
      console.error(`Error puntuando prediction ${prediction._id.toString()}:`, err);
    }
  }

  return { predictionsScored, predictionsFailed };
}
