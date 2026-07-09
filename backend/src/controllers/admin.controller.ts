import { Request, Response } from 'express';
import { env } from '../config/env';
import { syncLaLigaMatches } from '../jobs/syncMatches.job';
import { syncTopScorers } from '../jobs/syncScorers.job';
import { calculateScores } from '../jobs/calculateScores.job';

export async function triggerMatchSync(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await syncLaLigaMatches(season ?? env.currentSeason);
  res.json(result);
}

export async function triggerScorersSync(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await syncTopScorers(season ?? env.currentSeason);
  res.json(result);
}

export async function triggerCalculateScores(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await calculateScores(season ?? env.currentSeason);
  res.json(result);
}
