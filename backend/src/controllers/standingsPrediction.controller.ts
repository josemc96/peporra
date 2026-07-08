import { Request, Response } from 'express';
import { StandingsPrediction } from '../models/StandingsPrediction';
import { AppError } from '../utils/AppError';
import { isSeasonLocked } from '../services/season.service';

interface TableEntryInput {
  position?: unknown;
  team?: unknown;
}

function validatePredictedTable(predictedTable: unknown): { position: number; team: string }[] {
  if (!Array.isArray(predictedTable) || predictedTable.length === 0) {
    throw new AppError('predictedTable debe ser un array no vacío de { position, team }', 400);
  }

  const seenPositions = new Set<number>();
  const seenTeams = new Set<string>();

  return (predictedTable as TableEntryInput[]).map(({ position, team }) => {
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 1) {
      throw new AppError('Cada posición debe ser un entero positivo', 400);
    }
    if (typeof team !== 'string' || team.trim().length === 0) {
      throw new AppError('Cada equipo debe ser un string no vacío', 400);
    }
    if (seenPositions.has(position)) {
      throw new AppError(`Posición duplicada: ${position}`, 400);
    }
    if (seenTeams.has(team)) {
      throw new AppError(`Equipo duplicado: ${team}`, 400);
    }
    seenPositions.add(position);
    seenTeams.add(team);
    return { position, team };
  });
}

export async function upsertStandingsPrediction(req: Request, res: Response): Promise<void> {
  const { season, phase, predictedTable } = req.body as {
    season?: string;
    phase?: string;
    predictedTable?: unknown;
  };

  if (!season || (phase !== 'ida' && phase !== 'vuelta')) {
    throw new AppError('season es obligatorio y phase debe ser "ida" o "vuelta"', 400);
  }

  const parsedTable = validatePredictedTable(predictedTable);

  if (await isSeasonLocked(season)) {
    throw new AppError('La temporada ya ha empezado, no se pueden enviar predicciones de clasificación', 409);
  }

  const prediction = await StandingsPrediction.findOneAndUpdate(
    { user: req.user!.id, season, phase },
    { user: req.user!.id, season, phase, predictedTable: parsedTable, status: 'pending' },
    { upsert: true, new: true }
  );

  res.json({ prediction });
}

export async function listMyStandingsPredictions(req: Request, res: Response): Promise<void> {
  const { season } = req.query as { season?: string };
  const filter: Record<string, unknown> = { user: req.user!.id };
  if (season) filter.season = season;

  const predictions = await StandingsPrediction.find(filter);
  res.json({ predictions });
}

export async function getStandingsPrediction(req: Request, res: Response): Promise<void> {
  const { season, phase } = req.params;
  if (phase !== 'ida' && phase !== 'vuelta') {
    throw new AppError('phase debe ser "ida" o "vuelta"', 400);
  }

  const prediction = await StandingsPrediction.findOne({ user: req.user!.id, season, phase });
  res.json({ prediction: prediction ?? null });
}
