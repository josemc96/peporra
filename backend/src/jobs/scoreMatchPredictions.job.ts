import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Rule } from '../models/Rule';
import { ruleEvaluators } from '../services/rules/registry';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { resolveMultiplier } from '../services/rules/resolveMultiplier';
import { isCompetitionEnabledForGroup } from '../services/competitionEligibility.service';

export interface ScoreMatchPredictionsResult {
  predictionsScored: number;
}

export async function scoreMatchPredictions(): Promise<ScoreMatchPredictionsResult> {
  const finishedMatches = await Match.find({ status: 'finished' });
  const finishedMatchIds = finishedMatches.map((m) => m._id);
  const matchById = new Map(finishedMatches.map((m) => [m._id.toString(), m]));

  const pendingPredictions = await Prediction.find({ match: { $in: finishedMatchIds }, status: 'pending' });

  const allRules = await Rule.find();
  const ruleIdByKey = new Map(allRules.map((rule) => [rule.key, rule._id as Types.ObjectId]));

  let predictionsScored = 0;

  for (const prediction of pendingPredictions) {
    const match = matchById.get(prediction.match.toString())!;
    const user = await User.findById(prediction.user);
    if (!user) continue;

    const groups = await Group.find({ members: user._id });

    for (const group of groups) {
      const eligible = await isCompetitionEnabledForGroup(group._id as Types.ObjectId, match.season, match.competition);
      if (!eligible) continue;

      const activeRules = await resolveActiveRules(group._id as Types.ObjectId, match.season, 'match');

      let totalPoints = 0;
      const ruleBreakdown: { rule: Types.ObjectId; points: number }[] = [];

      for (const active of activeRules) {
        const evaluator = ruleEvaluators[active.key];
        const occurrences = evaluator({
          predictedHome: prediction.predictedHome,
          predictedAway: prediction.predictedAway,
          realHome: match.homeScore!,
          realAway: match.awayScore!,
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
    }

    prediction.status = 'scored';
    await prediction.save();
    predictionsScored += 1;
  }

  return { predictionsScored };
}
