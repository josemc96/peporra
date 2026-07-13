import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
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

// Derives who qualifies from the real match result (only for non-draws).
function deriveRealQualifier(homeScore: number, awayScore: number): 'home' | 'away' | null {
  if (homeScore === awayScore) return null; // draw — admin must set realQualifier manually
  return homeScore > awayScore ? 'home' : 'away';
}

export async function scoreQualifierPredictions(): Promise<ScoreQualifierPredictionsResult> {
  const finishedKnockoutMatches = await Match.find({ isKnockout: true, status: 'finished' });

  // A match is scoreable when we know the effective real qualifier:
  // - non-draw: we can derive it automatically
  // - draw: admin must have set realQualifier
  const scoreableMatches = finishedKnockoutMatches.filter((m) => {
    const isDraw = m.homeScore === m.awayScore;
    return !isDraw || !!m.realQualifier;
  });

  if (scoreableMatches.length === 0) return { predictionsScored: 0 };

  const matchIds = scoreableMatches.map((m) => m._id);
  const matchById = new Map(scoreableMatches.map((m) => [m._id.toString(), m]));

  // All score predictions for knockout matches
  const predictions = await Prediction.find({ match: { $in: matchIds } });

  // All explicit qualifier predictions (only needed for draw-predicted scenarios)
  const qualifierPreds = await QualifierPrediction.find({ match: { $in: matchIds } });
  const qualifierByUserMatch = new Map(
    qualifierPreds.map((q) => [`${q.user}:${q.match}`, q.predictedQualifier])
  );

  let predictionsScored = 0;

  for (const prediction of predictions) {
    const match = matchById.get(prediction.match.toString())!;

    // Real qualifier
    const realIsDraw = match.homeScore === match.awayScore;
    const effectiveRealQualifier: 'home' | 'away' = realIsDraw
      ? match.realQualifier!
      : deriveRealQualifier(match.homeScore!, match.awayScore!)!;

    // Predicted qualifier
    const predictedIsDraw = prediction.predictedHome === prediction.predictedAway;
    let effectivePredictedQualifier: 'home' | 'away' | null;

    if (!predictedIsDraw) {
      // Implicit: predicted winner = predicted qualifier
      effectivePredictedQualifier =
        prediction.predictedHome > prediction.predictedAway ? 'home' : 'away';
    } else {
      // Explicit: user must have filled in the qualifier chip
      effectivePredictedQualifier =
        qualifierByUserMatch.get(`${prediction.user}:${prediction.match}`) ?? null;
    }

    // If user predicted a draw but didn't fill in who qualifies, skip (no points)
    if (!effectivePredictedQualifier) continue;

    const user = await User.findById(prediction.user);
    if (!user) continue;

    const groups = await Group.find({ members: user._id });

    for (const group of groups) {
      const eligible = await isCompetitionEnabledForGroup(
        group._id as Types.ObjectId,
        match.season,
        match.competition
      );
      if (!eligible) continue;

      const activeRules = await resolveActiveRules(group._id as Types.ObjectId, match.season, 'knockout');

      let totalPoints = 0;
      for (const active of activeRules) {
        const evaluator = ruleEvaluators[active.key];
        const occurrences = evaluator({
          wasDrawAt90: realIsDraw,
          predictedQualifier: effectivePredictedQualifier,
          realQualifier: effectiveRealQualifier,
        } as never);
        totalPoints += occurrences * active.points;
      }

      const multiplier = await resolveMultiplier(
        group._id as Types.ObjectId,
        match._id as Types.ObjectId,
        match.matchday
      );
      const finalPoints = totalPoints * multiplier;

      await QualifierPredictionScore.findOneAndUpdate(
        { prediction: prediction._id, group: group._id },
        {
          prediction: prediction._id,
          group: group._id,
          points: finalPoints,
          multiplierApplied: multiplier > 1 ? multiplier : undefined,
        },
        { upsert: true }
      );
    }

    predictionsScored += 1;
  }

  return { predictionsScored };
}
