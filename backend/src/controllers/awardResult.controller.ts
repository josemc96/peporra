import { Request, Response } from 'express';
import { AwardResult } from '../models/AwardResult';
import { AppError } from '../utils/AppError';

export async function setAwardResult(req: Request, res: Response): Promise<void> {
  const { season, award, realPlayer } = req.body as {
    season?: string;
    award?: string;
    realPlayer?: string;
  };

  if (!season || (award !== 'pichichi' && award !== 'zamora')) {
    throw new AppError('season es obligatorio y award debe ser "pichichi" o "zamora"', 400);
  }
  if (!realPlayer?.trim()) {
    throw new AppError('realPlayer es obligatorio', 400);
  }

  const result = await AwardResult.findOneAndUpdate(
    { season, award },
    { season, award, realPlayer: realPlayer.trim() },
    { upsert: true, new: true }
  );

  res.json({ result });
}

export async function listAwardResults(req: Request, res: Response): Promise<void> {
  const { season } = req.query as { season?: string };

  const filter: Record<string, unknown> = {};
  if (season) filter.season = season;

  const results = await AwardResult.find(filter);
  res.json({ results });
}
