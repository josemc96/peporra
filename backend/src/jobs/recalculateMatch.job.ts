import { Types } from 'mongoose';
import { Match, IMatch } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { MatchdayPenalty } from '../models/MatchdayPenalty';
import { calculateScores } from './calculateScores.job';
import { AppError } from '../utils/AppError';

// Reabre un partido ya finalizado para que se repuntúe: marca sus predicciones otra vez
// como 'pending' (scoreMatchPredictions las recalculará con el marcador actual) y borra
// las penalizaciones de jornada ya calculadas de los grupos afectados, para que
// applyMatchdayPenalties (que se salta una jornada si ya tiene penalizaciones guardadas)
// también las recalcule. No puntúa aquí — hace falta un calculateScores() posterior
// (el propio cron, o una llamada inmediata) para que surta efecto.
export async function reopenMatchForRescoring(match: IMatch & { _id: Types.ObjectId }): Promise<void> {
  const affectedGroupIds = await Prediction.distinct('group', { match: match._id });
  await Prediction.updateMany({ match: match._id }, { status: 'pending' });

  if (match.matchday != null && affectedGroupIds.length > 0) {
    await MatchdayPenalty.deleteMany({
      group: { $in: affectedGroupIds },
      season: match.season,
      matchday: match.matchday,
    });
  }
}

// Recálculo manual disparado por el admin para un partido concreto ya finalizado (ej.
// football-data.org corrigió el resultado después de darlo por bueno).
export async function recalculateMatch(matchId: string): Promise<{ predictionsRescored: number }> {
  const match = await Match.findById(matchId);
  if (!match) throw new AppError('Partido no encontrado', 404);
  if (match.status !== 'finished') throw new AppError('El partido aún no ha terminado', 400);

  await reopenMatchForRescoring(match as IMatch & { _id: Types.ObjectId });
  const result = await calculateScores(match.season);
  return { predictionsRescored: result.matchPredictionsScored };
}
