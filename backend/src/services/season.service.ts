import { Match } from '../models/Match';

// Kickoff = inicio del primer partido de jornada 1 de La Liga.
// Sortear por matchday primero evita que partidos con fechas erróneas en la BD
// (de tests anteriores o syncs incorrectos) adelanten el kickoff real.
export async function getSeasonKickoff(season: string): Promise<Date | null> {
  const firstMatch = await Match.findOne(
    { season, competition: 'la_liga', matchday: { $exists: true, $ne: null } }
  ).sort({ matchday: 1, startTime: 1 });
  return firstMatch?.startTime ?? null;
}

export async function isSeasonLocked(season: string): Promise<boolean> {
  const kickoff = await getSeasonKickoff(season);
  if (!kickoff) return false;
  return new Date() >= kickoff;
}

// Vuelta = primer partido de jornada 19.
export async function isVueltaStarted(season: string): Promise<boolean> {
  const firstJ19 = await Match.findOne(
    { season, competition: 'la_liga', matchday: 19 }
  ).sort({ startTime: 1 });
  if (!firstJ19) return false;
  return new Date() >= firstJ19.startTime;
}
