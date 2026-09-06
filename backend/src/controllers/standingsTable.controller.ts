import { Request, Response } from 'express';
import { calculateFullCurrentTable } from '../services/standingsTable.service';
import { AppError } from '../utils/AppError';

// Tabla real de La Liga "ahora mismo" (no ligada a las fases fijas de la predicción de
// clasificación), con estadísticas completas — para mostrar contexto puntual en otras
// pantallas (posición de un equipo) y para la pantalla de clasificación completa.
export async function getCurrentStandingsTable(req: Request, res: Response): Promise<void> {
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  const table = await calculateFullCurrentTable(season);
  res.json({ table });
}
