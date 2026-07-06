import { Request, Response } from 'express';
import { env } from '../config/env';
import { syncLaLigaMatches } from '../jobs/syncMatches.job';

export async function triggerMatchSync(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await syncLaLigaMatches(season ?? env.currentSeason);
  res.json(result);
}
