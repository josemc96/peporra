import { Request, Response } from 'express';
import { Match } from '../models/Match';
import { QualifierPrediction } from '../models/QualifierPrediction';
import { AppError } from '../utils/AppError';

export async function upsertQualifierPrediction(req: Request, res: Response): Promise<void> {
  const { matchId, predictedQualifier } = req.body as {
    matchId?: string;
    predictedQualifier?: string;
  };

  if (!matchId || (predictedQualifier !== 'home' && predictedQualifier !== 'away')) {
    throw new AppError('matchId es obligatorio y predictedQualifier debe ser "home" o "away"', 400);
  }

  const match = await Match.findById(matchId);
  if (!match) {
    throw new AppError('Partido no encontrado', 404);
  }
  if (!match.isKnockout) {
    throw new AppError('Este partido no es de eliminatoria, no admite predicción de clasificado', 400);
  }
  if (new Date() >= match.startTime) {
    throw new AppError('Ya no se puede predecir este partido, ya ha empezado', 409);
  }

  const prediction = await QualifierPrediction.findOneAndUpdate(
    { user: req.user!.id, match: matchId },
    { user: req.user!.id, match: matchId, predictedQualifier, status: 'pending' },
    { upsert: true, new: true }
  );

  res.json({ prediction });
}

export async function listMyQualifierPredictions(req: Request, res: Response): Promise<void> {
  const predictions = await QualifierPrediction.find({ user: req.user!.id }).populate('match');
  res.json({ predictions });
}

export async function getQualifierPrediction(req: Request, res: Response): Promise<void> {
  const prediction = await QualifierPrediction.findOne({ user: req.user!.id, match: req.params.matchId });
  res.json({ prediction: prediction ?? null });
}
