import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { QualifierPrediction } from '../models/QualifierPrediction';
import { QualifierPredictionScore } from '../models/QualifierPredictionScore';
import { User } from '../models/User';
import { Group } from '../models/Group';
import { ruleEvaluators } from '../services/rules/registry';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { resolveMultiplier } from '../services/rules/resolveMultiplier';
import { isCompetitionEnabledForGroup } from '../services/competitionEligibility.service';

export interface ScoreQualifierPredictionsResult {
  predictionsScored: number;
}

export async function scoreQualifierPredictions(): Promise<ScoreQualifierPredictionsResult> {
  const finishedKnockoutMatches = await Match.find({ isKnockout: true, status: 'finished' });

  // Si acabó empatado a los 90' pero el admin aún no ha introducido quién se clasificó,
  // esperamos: no se puede puntuar todavía (ni como acierto ni como fallo).
  const scoreableMatches = finishedKnockoutMatches.filter((m) => {
    const wasDraw = m.homeScore === m.awayScore;
    return !wasDraw || !!m.realQualifier;
  });
  const matchIds = scoreableMatches.map((m) => m._id);
  const matchById = new Map(scoreableMatches.map((m) => [m._id.toString(), m]));

  const pendingPredictions = await QualifierPrediction.find({ match: { $in: matchIds }, status: 'pending' });

  let predictionsScored = 0;

  for (const prediction of pendingPredictions) {
    const match = matchById.get(prediction.match.toString())!;
    const user = await User.findById(prediction.user);
    if (!user) continue;

    const wasDrawAt90 = match.homeScore === match.awayScore;
    const groups = await Group.find({ members: user._id });

    for (const group of groups) {
      const eligible = await isCompetitionEnabledForGroup(group._id as Types.ObjectId, match.season, match.competition);
      if (!eligible) continue;

      const activeRules = await resolveActiveRules(group._id as Types.ObjectId, match.season, 'knockout');

      let totalPoints = 0;
      for (const active of activeRules) {
        const evaluator = ruleEvaluators[active.key];
        const occurrences = evaluator({
          wasDrawAt90,
          predictedQualifier: prediction.predictedQualifier,
          realQualifier: match.realQualifier,
        } as never);
        totalPoints += occurrences * active.points;
      }

      const multiplier = await resolveMultiplier(group._id as Types.ObjectId, match._id as Types.ObjectId, match.matchday);
      const finalPoints = totalPoints * multiplier;

      await QualifierPredictionScore.findOneAndUpdate(
        { qualifierPrediction: prediction._id, group: group._id },
        {
          qualifierPrediction: prediction._id,
          group: group._id,
          points: finalPoints,
          multiplierApplied: multiplier > 1 ? multiplier : undefined,
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
