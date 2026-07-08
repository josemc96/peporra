import { Match } from '../models/Match';

// Kickoff de la temporada = inicio del primer partido de La Liga de esa season.
// Si aún no hay partidos sincronizados, devuelve null (no se puede determinar bloqueo).
export async function getSeasonKickoff(season: string): Promise<Date | null> {
  const firstMatch = await Match.findOne({ season, competition: 'la_liga' }).sort({ startTime: 1 });
  return firstMatch?.startTime ?? null;
}

export async function isSeasonLocked(season: string): Promise<boolean> {
  const kickoff = await getSeasonKickoff(season);
  if (!kickoff) return false;
  return new Date() >= kickoff;
}
