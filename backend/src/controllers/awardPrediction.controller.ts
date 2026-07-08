import { Request, Response } from 'express';
import { AwardPrediction } from '../models/AwardPrediction';
import { AppError } from '../utils/AppError';
import { isSeasonLocked } from '../services/season.service';

export async function upsertAwardPrediction(req: Request, res: Response): Promise<void> {
  const { season, award, predictedPlayer } = req.body as {
    season?: string;
    award?: string;
    predictedPlayer?: string;
  };

  if (!season || (award !== 'pichichi' && award !== 'zamora')) {
    throw new AppError('season es obligatorio y award debe ser "pichichi" o "zamora"', 400);
  }
  if (typeof predictedPlayer !== 'string' || predictedPlayer.trim().length === 0) {
    throw new AppError('predictedPlayer es obligatorio', 400);
  }

  if (await isSeasonLocked(season)) {
    throw new AppError('La temporada ya ha empezado, no se pueden enviar predicciones de premios', 409);
  }

  const prediction = await AwardPrediction.findOneAndUpdate(
    { user: req.user!.id, season, award },
    { user: req.user!.id, season, award, predictedPlayer: predictedPlayer.trim(), status: 'pending' },
    { upsert: true, new: true }
  );

  res.json({ prediction });
}

export async function listMyAwardPredictions(req: Request, res: Response): Promise<void> {
  const { season } = req.query as { season?: string };
  const filter: Record<string, unknown> = { user: req.user!.id };
  if (season) filter.season = season;

  const predictions = await AwardPrediction.find(filter);
  res.json({ predictions });
}

export async function getAwardPrediction(req: Request, res: Response): Promise<void> {
  const { season, award } = req.params;
  if (award !== 'pichichi' && award !== 'zamora') {
    throw new AppError('award debe ser "pichichi" o "zamora"', 400);
  }

  const prediction = await AwardPrediction.findOne({ user: req.user!.id, season, award });
  res.json({ prediction: prediction ?? null });
}
