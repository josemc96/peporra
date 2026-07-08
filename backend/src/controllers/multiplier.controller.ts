import { Request, Response } from 'express';
import { ScoreMultiplier } from '../models/ScoreMultiplier';
import { AppError } from '../utils/AppError';
import { requireGroupAdmin, requireGroupMember } from '../services/groupAuth.service';

export async function createMultiplier(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, scope, match, matchday, multiplier } = req.body as {
    season?: string;
    scope?: string;
    match?: string;
    matchday?: number;
    multiplier?: number;
  };

  await requireGroupAdmin(groupId, req.user!.id);

  if (!season || (scope !== 'match' && scope !== 'matchday')) {
    throw new AppError('season es obligatorio y scope debe ser "match" o "matchday"', 400);
  }
  if (scope === 'match' && !match) {
    throw new AppError('match es obligatorio cuando scope es "match"', 400);
  }
  if (scope === 'matchday' && (matchday === undefined || !Number.isInteger(matchday))) {
    throw new AppError('matchday es obligatorio (entero) cuando scope es "matchday"', 400);
  }
  if (!Number.isInteger(multiplier) || (multiplier as number) < 1) {
    throw new AppError('multiplier debe ser un entero >= 1', 400);
  }

  const created = await ScoreMultiplier.create({
    group: groupId,
    season,
    scope,
    match: scope === 'match' ? match : undefined,
    matchday: scope === 'matchday' ? matchday : undefined,
    multiplier,
  });

  res.status(201).json({ multiplier: created });
}

export async function listMultipliers(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };

  await requireGroupMember(groupId, req.user!.id);

  const filter: Record<string, unknown> = { group: groupId };
  if (season) filter.season = season;

  const multipliers = await ScoreMultiplier.find(filter);
  res.json({ multipliers });
}

export async function deleteMultiplier(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const id = req.params.id as string;

  await requireGroupAdmin(groupId, req.user!.id);

  const deleted = await ScoreMultiplier.findOneAndDelete({ _id: id, group: groupId });
  if (!deleted) {
    throw new AppError('Multiplicador no encontrado', 404);
  }

  res.status(204).send();
}
