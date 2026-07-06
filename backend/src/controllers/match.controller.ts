import { Request, Response } from 'express';
import { Match } from '../models/Match';
import { env } from '../config/env';

export async function listMatches(req: Request, res: Response): Promise<void> {
  const { season, matchday, competition } = req.query as {
    season?: string;
    matchday?: string;
    competition?: string;
  };

  const filter: Record<string, unknown> = { season: season ?? env.currentSeason };
  if (matchday) filter.matchday = Number(matchday);
  if (competition) filter.competition = competition;

  const matches = await Match.find(filter).sort({ startTime: 1 });
  res.json({ matches });
}
