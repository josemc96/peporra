import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Group } from '../models/Group';
import { Prediction } from '../models/Prediction';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export async function upsertPrediction(req: Request, res: Response): Promise<void> {
  const { matchId, groupId, predictedHome, predictedAway } = req.body as {
    matchId?: string;
    groupId?: string;
    predictedHome?: number;
    predictedAway?: number;
  };

  if (!matchId || !groupId || !isNonNegativeInteger(predictedHome) || !isNonNegativeInteger(predictedAway)) {
    throw new AppError(
      'matchId y groupId son obligatorios; predictedHome y predictedAway deben ser enteros no negativos',
      400
    );
  }

  const group = await Group.findOne({ _id: groupId, members: req.user!.id });
  if (!group) {
    throw new AppError('Peña no encontrada o no eres miembro', 403);
  }

  const match = await Match.findById(matchId);
  if (!match) {
    throw new AppError('Partido no encontrado', 404);
  }
  if (new Date() >= match.startTime) {
    throw new AppError('Ya no se puede predecir este partido, ya ha empezado', 409);
  }

  const prediction = await Prediction.findOneAndUpdate(
    { user: req.user!.id, match: matchId, group: groupId },
    { user: req.user!.id, match: matchId, group: groupId, predictedHome, predictedAway, status: 'pending' },
    { upsert: true, new: true }
  );

  res.json({ prediction });
}

export async function listMyPredictions(req: Request, res: Response): Promise<void> {
  const { matchday, season, groupId } = req.query as { matchday?: string; season?: string; groupId?: string };

  if (!groupId) {
    throw new AppError('groupId es obligatorio', 400);
  }

  const group = await Group.findOne({ _id: groupId, members: req.user!.id });
  if (!group) {
    throw new AppError('Peña no encontrada o no eres miembro', 403);
  }

  const matchFilter: Record<string, unknown> = {};
  if (matchday) matchFilter.matchday = Number(matchday);
  if (season) matchFilter.season = season;

  const predictionFilter: Record<string, unknown> = { user: req.user!.id, group: groupId };
  if (Object.keys(matchFilter).length > 0) {
    const matches = await Match.find(matchFilter).select('_id');
    predictionFilter.match = { $in: matches.map((m) => m._id) };
  }

  const predictions = await Prediction.find(predictionFilter).populate('match');
  res.json({ predictions });
}

export async function getPredictionForMatch(req: Request, res: Response): Promise<void> {
  const { groupId } = req.query as { groupId?: string };

  if (!groupId) {
    throw new AppError('groupId es obligatorio', 400);
  }

  const prediction = await Prediction.findOne({ user: req.user!.id, match: req.params.matchId, group: groupId });
  res.json({ prediction: prediction ?? null });
}

// Para cada partido de La Liga de la temporada, quién de la peña aún no ha predicho —
// solo el nombre (quién falta), nunca qué predijo cada uno (eso sigue oculto antes del
// kickoff, lo gestiona matchPredictionVisibility.controller.ts).
export async function getMissingPredictors(req: Request, res: Response): Promise<void> {
  const { groupId, season } = req.query as { groupId?: string; season?: string };
  if (!groupId || !season) {
    throw new AppError('groupId y season son obligatorios', 400);
  }

  const group = await Group.findOne({ _id: groupId, members: req.user!.id });
  if (!group) {
    throw new AppError('Peña no encontrada o no eres miembro', 403);
  }

  const memberIds = group.members.map((m) => m.toString());
  const users = await User.find({ _id: { $in: memberIds } }).select('alias');
  const aliasById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u.alias]));

  const matches = await Match.find({ season, competition: 'la_liga' }).select('_id');
  const matchIds = matches.map((m) => m._id);

  const predictions = await Prediction.find({ group: groupId, match: { $in: matchIds } }).select('user match');
  const predictedByMatch = new Map<string, Set<string>>();
  for (const pred of predictions) {
    const key = pred.match.toString();
    if (!predictedByMatch.has(key)) predictedByMatch.set(key, new Set());
    predictedByMatch.get(key)!.add(pred.user.toString());
  }

  const missing: Record<string, { id: string; alias: string }[]> = {};
  for (const matchId of matchIds) {
    const key = matchId.toString();
    const predicted = predictedByMatch.get(key) ?? new Set<string>();
    const missingIds = memberIds.filter((id) => !predicted.has(id));
    if (missingIds.length > 0) {
      missing[key] = missingIds.map((id) => ({ id, alias: aliasById.get(id) ?? id }));
    }
  }

  res.json({ missing });
}

export async function getMyPredictionsAcrossGroups(req: Request, res: Response): Promise<void> {
  const groups = await Group.find({ members: req.user!.id }).select('_id name');

  const results = await Promise.all(
    groups.map(async (g) => {
      const prediction = await Prediction.findOne({
        user: req.user!.id,
        match: req.params.matchId,
        group: g._id,
      }).select('predictedHome predictedAway');
      return {
        groupId: (g._id as import('mongoose').Types.ObjectId).toString(),
        groupName: g.name,
        prediction: prediction
          ? { predictedHome: prediction.predictedHome, predictedAway: prediction.predictedAway }
          : null,
      };
    })
  );

  res.json({ groups: results });
}
