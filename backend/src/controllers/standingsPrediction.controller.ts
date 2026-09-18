import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { StandingsPrediction } from '../models/StandingsPrediction';
import { AppError } from '../utils/AppError';
import { isSeasonLocked, isVueltaStarted } from '../services/season.service';
import { requireGroupMember } from '../services/groupAuth.service';
import { calculateCurrentTable } from '../services/standingsTable.service';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { ruleEvaluators } from '../services/rules/registry';
import { StandingsPhase } from '../types/enums';

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

  // La Ida se bloquea al empezar la Liga (J1); la Vuelta se bloquea aparte, al empezar
  // la propia vuelta (J19) — no tiene sentido cerrarla meses antes de que arranque.
  const locked = phase === 'ida' ? await isSeasonLocked(season) : await isVueltaStarted(season);
  if (locked) {
    throw new AppError(
      phase === 'ida'
        ? 'La Liga ya ha empezado, no se puede enviar la predicción de la Ida'
        : 'La vuelta ya ha empezado, no se puede enviar la predicción de la Vuelta',
      409
    );
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

export async function getGroupStandingsPredictions(req: Request, res: Response): Promise<void> {
  const groupId = String(req.params.groupId);
  const { season, phase } = req.query as { season?: string; phase?: string };

  if (!season) throw new AppError('season es obligatorio', 400);
  if (phase && phase !== 'ida' && phase !== 'vuelta') {
    throw new AppError('phase debe ser "ida" o "vuelta"', 400);
  }

  const group = await requireGroupMember(groupId, req.user!.id);

  // Igual que con los Premios: no se revela la predicción de un miembro hasta que ya no
  // se pueda editar — la Ida se revela al empezar la temporada (J1), pero la Vuelta se
  // guarda desde el principio y no debe verse hasta que empiece de verdad (J19), aunque
  // la temporada ya esté en marcha.
  const [seasonLocked, vueltaStarted] = await Promise.all([
    isSeasonLocked(season),
    isVueltaStarted(season),
  ]);
  const revealablePhases: StandingsPhase[] = [
    ...(seasonLocked ? (['ida'] as StandingsPhase[]) : []),
    ...(vueltaStarted ? (['vuelta'] as StandingsPhase[]) : []),
  ];
  const phasesToQuery: StandingsPhase[] = phase
    ? (revealablePhases.includes(phase as StandingsPhase) ? [phase as StandingsPhase] : [])
    : revealablePhases;

  if (phasesToQuery.length === 0) {
    res.json({ predictions: [] });
    return;
  }

  const predictions = await StandingsPrediction.find({
    user: { $in: group.members }, season, phase: { $in: phasesToQuery },
  }).populate('user', 'alias email');

  // Puntos "si la clasificación se quedara así ahora mismo" — mismo cálculo que el job de
  // puntuación real (services/rules) pero contra la tabla en vivo, no la ya cerrada en la
  // jornada de corte de cada fase (que puede no haber llegado todavía).
  const currentTable = await calculateCurrentTable(season);
  const activeRules = await resolveActiveRules(group._id as Types.ObjectId, season, 'standings');

  const predictionsWithLivePoints = predictions.map((prediction) => {
    let livePoints = 0;
    for (const active of activeRules) {
      const evaluator = ruleEvaluators[active.key];
      const occurrences = evaluator({
        predictedTable: prediction.predictedTable,
        realTable: currentTable,
      } as never);
      livePoints += occurrences * active.points;
    }
    return { ...prediction.toObject(), livePoints };
  });

  res.json({ predictions: predictionsWithLivePoints });
}
