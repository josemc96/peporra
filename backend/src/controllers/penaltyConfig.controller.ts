import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { PenaltyConfig } from '../models/PenaltyConfig';
import { MatchdayPenalty } from '../models/MatchdayPenalty';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { User } from '../models/User';
import { ManualAdjustment } from '../models/ManualAdjustment';
import { AppError } from '../utils/AppError';
import { requireGroupAdmin, requireGroupMember } from '../services/groupAuth.service';
import { applyMatchdayPenalties } from '../jobs/applyMatchdayPenalties.job';

export async function getPenaltyConfig(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  await requireGroupMember(groupId, req.user!.id);

  const config = await PenaltyConfig.findOne({ group: groupId, season });
  res.json({ config: config ?? null });
}

export async function updatePenaltyConfig(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, penalties } = req.body as {
    season?: string;
    penalties?: { position: number; amount: number }[];
  };

  if (!season) throw new AppError('season es obligatorio', 400);
  if (!Array.isArray(penalties)) throw new AppError('penalties debe ser un array', 400);

  for (const p of penalties) {
    if (!Number.isInteger(p.position) || p.position < 1) {
      throw new AppError('position debe ser un entero positivo', 400);
    }
    if (typeof p.amount !== 'number' || p.amount < 0) {
      throw new AppError('amount debe ser un número no negativo', 400);
    }
  }

  await requireGroupAdmin(groupId, req.user!.id);

  const config = await PenaltyConfig.findOneAndUpdate(
    { group: groupId, season },
    { group: groupId, season, penalties },
    { upsert: true, new: true }
  );

  res.json({ config });
}

export async function recalculatePenalties(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.body as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  await requireGroupAdmin(groupId, req.user!.id);

  // Delete existing penalties for this group+season and reapply from scratch
  await MatchdayPenalty.deleteMany({ group: groupId, season });
  await applyMatchdayPenalties(new Types.ObjectId(groupId));

  res.json({ message: 'Deuda recalculada' });
}

export async function getMatchdayRanking(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday } = req.query as { season?: string; matchday?: string };
  if (!season) throw new AppError('season es obligatorio', 400);
  if (!matchday) throw new AppError('matchday es obligatorio', 400);

  const matchdayNum = parseInt(matchday, 10);
  if (isNaN(matchdayNum)) throw new AppError('matchday debe ser un número', 400);

  const group = await requireGroupMember(groupId, req.user!.id);
  const memberIds = group.members.map((m) => m.toString());

  const matches = await Match.find({ competition: 'la_liga', season, matchday: matchdayNum }).select('_id homeScore awayScore status');
  const matchIds = matches.map((m) => m._id);

  const totals = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const exactScores = new Map<string, number>(memberIds.map((id) => [id, 0]));

  if (matchIds.length) {
    const predictions = await Prediction.find({ match: { $in: matchIds } }).select('_id user predictedHome predictedAway match');
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

    const finishedMatchMap = new Map(
      matches.filter((m) => m.status === 'finished').map((m) => [m._id.toString(), m])
    );
    for (const pred of predictions) {
      const match = finishedMatchMap.get(pred.match.toString());
      if (match && pred.predictedHome === match.homeScore && pred.predictedAway === match.awayScore) {
        const key = pred.user.toString();
        exactScores.set(key, (exactScores.get(key) ?? 0) + 1);
      }
    }
  }

  const users = await User.find({ _id: { $in: memberIds } }).select('alias email');
  const userById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]));

  const ranking = Array.from(totals.entries())
    .map(([userId, points]) => ({
      user: { id: userId, alias: userById.get(userId)?.alias, email: userById.get(userId)?.email },
      points,
      exactScores: exactScores.get(userId) ?? 0,
    }))
    .sort((a, b) => b.points !== a.points ? b.points - a.points : b.exactScores - a.exactScores);

  res.json({ ranking, matchday: matchdayNum, season });
}

export async function getGroupDebt(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  const group = await requireGroupMember(groupId, req.user!.id);
  const memberIds = group.members.map((m) => m.toString());

  const penalties = await MatchdayPenalty.find({ group: groupId, season });
  const debtMap = new Map<string, number>(memberIds.map((id) => [id, 0]));
  for (const p of penalties) {
    const key = p.user.toString();
    debtMap.set(key, (debtMap.get(key) ?? 0) + p.amount);
  }

  const manualAdj = await ManualAdjustment.find({ group: groupId, season, moneyAmount: { $ne: 0 } });
  for (const adj of manualAdj) {
    const key = adj.user.toString();
    if (debtMap.has(key)) debtMap.set(key, (debtMap.get(key) ?? 0) + adj.moneyAmount);
  }

  const users = await User.find({ _id: { $in: memberIds } }).select('alias email');
  const userById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]));

  const debt = Array.from(debtMap.entries()).map(([userId, total]) => ({
    user: { id: userId, alias: userById.get(userId)?.alias, email: userById.get(userId)?.email },
    total,
  }));

  res.json({ debt });
}
