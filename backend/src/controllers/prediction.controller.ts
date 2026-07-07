import { Request, Response } from 'express';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { AppError } from '../utils/AppError';

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export async function upsertPrediction(req: Request, res: Response): Promise<void> {
  const { matchId, predictedHome, predictedAway } = req.body as {
    matchId?: string;
    predictedHome?: number;
    predictedAway?: number;
  };

  if (!matchId || !isNonNegativeInteger(predictedHome) || !isNonNegativeInteger(predictedAway)) {
    throw new AppError(
      'matchId es obligatorio; predictedHome y predictedAway deben ser enteros no negativos',
      400
    );
  }

  const match = await Match.findById(matchId);
  if (!match) {
    throw new AppError('Partido no encontrado', 404);
  }
  if (new Date() >= match.startTime) {
    throw new AppError('Ya no se puede predecir este partido, ya ha empezado', 409);
  }

  const prediction = await Prediction.findOneAndUpdate(
    { user: req.user!.id, match: matchId },
    { user: req.user!.id, match: matchId, predictedHome, predictedAway, status: 'pending' },
    { upsert: true, new: true }
  );

  res.json({ prediction });
}

export async function listMyPredictions(req: Request, res: Response): Promise<void> {
  const { matchday, season } = req.query as { matchday?: string; season?: string };

  const matchFilter: Record<string, unknown> = {};
  if (matchday) matchFilter.matchday = Number(matchday);
  if (season) matchFilter.season = season;

  const predictionFilter: Record<string, unknown> = { user: req.user!.id };
  if (Object.keys(matchFilter).length > 0) {
    const matches = await Match.find(matchFilter).select('_id');
    predictionFilter.match = { $in: matches.map((m) => m._id) };
  }

  const predictions = await Prediction.find(predictionFilter).populate('match');
  res.json({ predictions });
}

export async function getPredictionForMatch(req: Request, res: Response): Promise<void> {
  const prediction = await Prediction.findOne({ user: req.user!.id, match: req.params.matchId });
  res.json({ prediction: prediction ?? null });
}
