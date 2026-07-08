import { Request, Response } from 'express';
import { Scorer } from '../models/Scorer';
import { env } from '../config/env';

export async function listScorers(req: Request, res: Response): Promise<void> {
  const { season } = req.query as { season?: string };

  const scorers = await Scorer.find({ season: season ?? env.currentSeason }).sort({ goals: -1 });
  res.json({ scorers });
}
