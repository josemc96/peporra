import { Match } from '../models/Match';
import { StandingsPhase } from '../types/enums';

// Fijo, no configurable por el admin: ida = corte en jornada 19, vuelta = fin de temporada (38).
export const PHASE_MATCHDAY: Record<StandingsPhase, number> = {
  ida: 19,
  vuelta: 38,
};

interface StandingsRow {
  team: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}

export async function isPhaseComplete(season: string, phase: StandingsPhase): Promise<boolean> {
  const throughMatchday = PHASE_MATCHDAY[phase];
  const pending = await Match.countDocuments({
    season,
    competition: 'la_liga',
    matchday: { $lte: throughMatchday },
    status: 'pending',
  });
  return pending === 0;
}

// Calcula la tabla real a partir de nuestros propios partidos guardados (no se sincroniza
// aparte desde la API). Desempate simplificado: puntos, diferencia de goles, goles a favor.
export async function calculateRealTable(
  season: string,
  phase: StandingsPhase
): Promise<{ position: number; team: string }[]> {
  const throughMatchday = PHASE_MATCHDAY[phase];
  const matches = await Match.find({
    season,
    competition: 'la_liga',
    matchday: { $lte: throughMatchday },
    status: 'finished',
  });

  const table = new Map<string, StandingsRow>();
  function ensure(team: string): StandingsRow {
    let row = table.get(team);
    if (!row) {
      row = { team, points: 0, goalsFor: 0, goalsAgainst: 0 };
      table.set(team, row);
    }
    return row;
  }

  for (const match of matches) {
    const home = ensure(match.homeTeam);
    const away = ensure(match.awayTeam);
    const homeScore = match.homeScore!;
    const awayScore = match.awayScore!;

    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) home.points += 3;
    else if (homeScore < awayScore) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  return Array.from(table.values())
    .sort((a, b) => {
      const diffA = a.goalsFor - a.goalsAgainst;
      const diffB = b.goalsFor - b.goalsAgainst;
      return b.points - a.points || diffB - diffA || b.goalsFor - a.goalsFor;
    })
    .map((row, index) => ({ position: index + 1, team: row.team }));
}
