import { Request, Response } from 'express';
import { calculateCurrentTable } from '../services/standingsTable.service';
import { AppError } from '../utils/AppError';

// Tabla real de La Liga "ahora mismo" (no ligada a las fases fijas de la predicción de
// clasificación) — para mostrar contexto (ej. posición de cada equipo) en otras pantallas.
export async function getCurrentStandingsTable(req: Request, res: Response): Promise<void> {
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  const table = await calculateCurrentTable(season);
  res.json({ table });
}
