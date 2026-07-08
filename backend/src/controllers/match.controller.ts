import { Request, Response } from 'express';
import { Match } from '../models/Match';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

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

// Alta manual de partidos de Copa del Rey (final) / Supercopa — no vienen del cron,
// football-data.org (plan free) no cubre estas competiciones.
export async function createManualMatch(req: Request, res: Response): Promise<void> {
  const { season, competition, homeTeam, awayTeam, startTime } = req.body as {
    season?: string;
    competition?: string;
    homeTeam?: string;
    awayTeam?: string;
    startTime?: string;
  };

  if (!season || (competition !== 'copa_del_rey' && competition !== 'supercopa')) {
    throw new AppError('season es obligatorio y competition debe ser "copa_del_rey" o "supercopa"', 400);
  }
  if (!homeTeam?.trim() || !awayTeam?.trim()) {
    throw new AppError('homeTeam y awayTeam son obligatorios', 400);
  }
  if (!startTime || Number.isNaN(new Date(startTime).getTime())) {
    throw new AppError('startTime debe ser una fecha válida', 400);
  }

  const match = await Match.create({
    season,
    competition,
    isKnockout: true,
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    startTime: new Date(startTime),
  });

  res.status(201).json({ match });
}

export async function setMatchResult(req: Request, res: Response): Promise<void> {
  const { homeScore, awayScore } = req.body as { homeScore?: number; awayScore?: number };

  if (!isNonNegativeInteger(homeScore) || !isNonNegativeInteger(awayScore)) {
    throw new AppError('homeScore y awayScore deben ser enteros no negativos', 400);
  }

  const match = await Match.findById(req.params.id);
  if (!match) {
    throw new AppError('Partido no encontrado', 404);
  }

  match.homeScore = homeScore;
  match.awayScore = awayScore;
  match.status = 'finished';
  await match.save();

  res.json({ match });
}

export async function setMatchQualifier(req: Request, res: Response): Promise<void> {
  const { qualifier } = req.body as { qualifier?: string };

  if (qualifier !== 'home' && qualifier !== 'away') {
    throw new AppError('qualifier debe ser "home" o "away"', 400);
  }

  const match = await Match.findById(req.params.id);
  if (!match) {
    throw new AppError('Partido no encontrado', 404);
  }
  if (!match.isKnockout) {
    throw new AppError('Este partido no es de eliminatoria', 400);
  }
  if (match.status !== 'finished') {
    throw new AppError('Introduce primero el resultado del partido', 400);
  }
  if (match.homeScore !== match.awayScore) {
    throw new AppError('El partido no acabó empatado a los 90\', no aplica quién se clasifica', 400);
  }

  match.realQualifier = qualifier;
  await match.save();

  res.json({ match });
}
