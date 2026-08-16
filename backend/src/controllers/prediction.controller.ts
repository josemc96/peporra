import { Request, Response } from 'express';
import { Match } from '../models/Match';
import { Group } from '../models/Group';
import { Prediction } from '../models/Prediction';
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
