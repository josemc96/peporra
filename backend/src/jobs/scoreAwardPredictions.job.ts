import { Types } from 'mongoose';
import { AwardPrediction } from '../models/AwardPrediction';
import { AwardPredictionScore } from '../models/AwardPredictionScore';
import { AwardResult } from '../models/AwardResult';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { ruleEvaluators } from '../services/rules/registry';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { AwardType } from '../types/enums';

export interface ScoreAwardPredictionsResult {
  predictionsScored: number;
}

export async function scoreAwardPredictions(season: string): Promise<ScoreAwardPredictionsResult> {
  let predictionsScored = 0;
  const awards: AwardType[] = ['pichichi', 'zamora'];

  for (const award of awards) {
    const result = await AwardResult.findOne({ season, award });
    if (!result) continue; // el admin aún no ha introducido el resultado real

    const ruleKey = `${award}_correct` as const;
    const pendingPredictions = await AwardPrediction.find({ season, award, status: 'pending' });

    for (const prediction of pendingPredictions) {
      const user = await User.findById(prediction.user);
      if (!user) continue;

      const groups = await Group.find({ members: user._id });

      for (const group of groups) {
        const activeRules = await resolveActiveRules(group._id as Types.ObjectId, season, 'award');
        const active = activeRules.find((r) => r.key === ruleKey);
        if (!active) continue; // esta peña no tiene activada esta regla en concreto

        const evaluator = ruleEvaluators[active.key];
        const occurrences = evaluator({
          predictedPlayer: prediction.predictedPlayer,
          realPlayer: result.realPlayer,
        } as never);
        const points = occurrences * active.points;

        await AwardPredictionScore.findOneAndUpdate(
          { awardPrediction: prediction._id, group: group._id },
          { awardPrediction: prediction._id, group: group._id, points },
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
