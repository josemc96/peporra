import { Match } from '../models/Match';
import { StandingsPhase } from '../types/enums';

// Fijo, no configurable por el admin: ida = corte en jornada 19, vuelta = fin de temporada (38).
export const PHASE_MATCHDAY: Record<StandingsPhase, number> = {
  ida: 19,
  vuelta: 38,
};

interface StandingsRow {
  team: string;
  crest?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface FullStandingsRow extends StandingsRow {
  position: number;
  goalDifference: number;
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

async function buildTable(season: string, throughMatchday?: number): Promise<StandingsRow[]> {
  const matches = await Match.find({
    season,
    competition: 'la_liga',
    ...(throughMatchday != null && { matchday: { $lte: throughMatchday } }),
    status: 'finished',
  });

  const table = new Map<string, StandingsRow>();
  function ensure(team: string, crest?: string): StandingsRow {
    let row = table.get(team);
    if (!row) {
      row = { team, crest, played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0 };
      table.set(team, row);
    } else if (!row.crest && crest) {
      row.crest = crest;
    }
    return row;
  }

  for (const match of matches) {
    const home = ensure(match.homeTeam, match.homeCrest);
    const away = ensure(match.awayTeam, match.awayCrest);
    const homeScore = match.homeScore!;
    const awayScore = match.awayScore!;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1; home.points += 3;
      away.lost += 1;
    } else if (homeScore < awayScore) {
      away.won += 1; away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1; home.points += 1;
      away.drawn += 1; away.points += 1;
    }
  }

  return Array.from(table.values()).sort((a, b) => {
    const diffA = a.goalsFor - a.goalsAgainst;
    const diffB = b.goalsFor - b.goalsAgainst;
    return b.points - a.points || diffB - diffA || b.goalsFor - a.goalsFor;
  });
}

// Calcula la tabla real a partir de nuestros propios partidos guardados (no se sincroniza
// aparte desde la API). Desempate simplificado: puntos, diferencia de goles, goles a favor.
export async function calculateRealTable(
  season: string,
  phase: StandingsPhase
): Promise<{ position: number; team: string }[]> {
  const rows = await buildTable(season, PHASE_MATCHDAY[phase]);
  return rows.map((row, index) => ({ position: index + 1, team: row.team }));
}

// Tabla real "ahora mismo", sin corte de jornada — para mostrar la posición actual de un
// equipo (ej. en el editor de predicción), no ligada a las fases fijas de ida/vuelta.
export async function calculateCurrentTable(
  season: string
): Promise<{ position: number; team: string }[]> {
  const rows = await buildTable(season);
  return rows.map((row, index) => ({ position: index + 1, team: row.team }));
}

// Tabla completa "ahora mismo" con todas las estadísticas (PJ/PG/PE/PP/GF/GC/Pts) — para la
// pantalla de clasificación completa de la peña.
export async function calculateFullCurrentTable(season: string): Promise<FullStandingsRow[]> {
  const rows = await buildTable(season);
  return rows.map((row, index) => ({
    ...row,
    position: index + 1,
    goalDifference: row.goalsFor - row.goalsAgainst,
  }));
}
