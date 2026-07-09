import { Types } from 'mongoose';
import { StandingsPrediction } from '../models/StandingsPrediction';
import { StandingsPredictionScore } from '../models/StandingsPredictionScore';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { Rule } from '../models/Rule';
import { ruleEvaluators } from '../services/rules/registry';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { isPhaseComplete, calculateRealTable } from '../services/standingsTable.service';
import { StandingsPhase } from '../types/enums';

export interface ScoreStandingsPredictionsResult {
  predictionsScored: number;
}

export async function scoreStandingsPredictions(season: string): Promise<ScoreStandingsPredictionsResult> {
  let predictionsScored = 0;
  const allRules = await Rule.find();
  const ruleIdByKey = new Map(allRules.map((rule) => [rule.key, rule._id as Types.ObjectId]));

  const phases: StandingsPhase[] = ['ida', 'vuelta'];

  for (const phase of phases) {
    if (!(await isPhaseComplete(season, phase))) continue;

    const realTable = await calculateRealTable(season, phase);
    const pendingPredictions = await StandingsPrediction.find({ season, phase, status: 'pending' });

    for (const prediction of pendingPredictions) {
      const user = await User.findById(prediction.user);
      if (!user) continue;

      const groups = await Group.find({ members: user._id });

      for (const group of groups) {
        const activeRules = await resolveActiveRules(group._id as Types.ObjectId, season, 'standings');

        let totalPoints = 0;
        const ruleBreakdown: { rule: Types.ObjectId; points: number }[] = [];

        for (const active of activeRules) {
          const evaluator = ruleEvaluators[active.key];
          const occurrences = evaluator({
            predictedTable: prediction.predictedTable,
            realTable,
          } as never);

          if (occurrences > 0) {
            const rulePoints = occurrences * active.points;
            totalPoints += rulePoints;
            const ruleId = ruleIdByKey.get(active.key);
            if (ruleId) ruleBreakdown.push({ rule: ruleId, points: rulePoints });
          }
        }

        await StandingsPredictionScore.findOneAndUpdate(
          { standingsPrediction: prediction._id, group: group._id },
          { standingsPrediction: prediction._id, group: group._id, points: totalPoints, ruleBreakdown },
          { upsert: true }
        );
      }

      prediction.status = 'scored';
      await prediction.save();
      predictionsScored += 1;
    }
  }

  return { predictionsScored };
}
