import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { QualifierPrediction } from '../models/QualifierPrediction';
import { QualifierPredictionScore } from '../models/QualifierPredictionScore';
import { StandingsPrediction } from '../models/StandingsPrediction';
import { StandingsPredictionScore } from '../models/StandingsPredictionScore';
import { AwardPrediction } from '../models/AwardPrediction';
import { AwardPredictionScore } from '../models/AwardPredictionScore';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { requireGroupMember } from '../services/groupAuth.service';

export async function getGroupRanking(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) {
    throw new AppError('season es obligatorio', 400);
  }

  const group = await requireGroupMember(groupId, req.user!.id);

  const totals = new Map<string, number>();
  for (const memberId of group.members) {
    totals.set(memberId.toString(), 0);
  }

  function addPoints(userId: Types.ObjectId, points: number): void {
    const key = userId.toString();
    totals.set(key, (totals.get(key) ?? 0) + points);
  }

  // Partidos y "quién se clasifica" comparten Match -> se filtran por season a través de él.
  const seasonMatches = await Match.find({ season }).select('_id');
  const seasonMatchIds = seasonMatches.map((m) => m._id);

  const predictions = await Prediction.find({ match: { $in: seasonMatchIds } }).select('_id user');
  const predictionUserById = new Map(predictions.map((p) => [p._id.toString(), p.user]));
  const predictionScores = await PredictionScore.find({
    group: groupId,
    prediction: { $in: predictions.map((p) => p._id) },
  });
  for (const score of predictionScores) {
    const userId = predictionUserById.get(score.prediction.toString());
    if (userId) addPoints(userId, score.points);
  }

  const qualifierPredictions = await QualifierPrediction.find({ match: { $in: seasonMatchIds } }).select('_id user');
  const qualifierUserById = new Map(qualifierPredictions.map((p) => [p._id.toString(), p.user]));
  const qualifierScores = await QualifierPredictionScore.find({
    group: groupId,
    qualifierPrediction: { $in: qualifierPredictions.map((p) => p._id) },
  });
  for (const score of qualifierScores) {
    const userId = qualifierUserById.get(score.qualifierPrediction.toString());
    if (userId) addPoints(userId, score.points);
  }

  const standingsPredictions = await StandingsPrediction.find({ season }).select('_id user');
  const standingsUserById = new Map(standingsPredictions.map((p) => [p._id.toString(), p.user]));
  const standingsScores = await StandingsPredictionScore.find({
    group: groupId,
    standingsPrediction: { $in: standingsPredictions.map((p) => p._id) },
  });
  for (const score of standingsScores) {
    const userId = standingsUserById.get(score.standingsPrediction.toString());
    if (userId) addPoints(userId, score.points);
  }

  const awardPredictions = await AwardPrediction.find({ season }).select('_id user');
  const awardUserById = new Map(awardPredictions.map((p) => [p._id.toString(), p.user]));
  const awardScores = await AwardPredictionScore.find({
    group: groupId,
    awardPrediction: { $in: awardPredictions.map((p) => p._id) },
  });
  for (const score of awardScores) {
    const userId = awardUserById.get(score.awardPrediction.toString());
    if (userId) addPoints(userId, score.points);
  }

  const users = await User.find({ _id: { $in: Array.from(totals.keys()) } }).select('alias email');
  const userById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]));

  const ranking = Array.from(totals.entries())
    .map(([userId, points]) => ({
      user: { id: userId, alias: userById.get(userId)?.alias, email: userById.get(userId)?.email },
      points,
    }))
    .sort((a, b) => b.points - a.points);

  res.json({ ranking });
}
