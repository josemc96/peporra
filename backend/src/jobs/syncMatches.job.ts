import { fetchLaLigaMatches, FootballDataMatch } from '../services/footballApi.service';
import { Match, IMatch } from '../models/Match';
import { MatchStatus } from '../types/enums';
import { reopenMatchForRescoring } from './recalculateMatch.job';
import { Types } from 'mongoose';

export interface SyncMatchesResult {
  processed: number;
  created: number;
  updated: number;
  rescored: number;
}

function toSeasonStartYear(season: string): string {
  // "2026-2027" -> "2026" (formato que espera football-data.org)
  return season.split('-')[0];
}

// Solo confirma "finished" cuando la API lo dice; nunca se pisa un partido que ya se marcó
// "finished" (a mano o por sync previo) si football-data.org va con retraso reflejando el
// resultado. "postponed" refleja un aplazamiento ANTES del kickoff (la API aún no tiene la
// nueva fecha) — se recupera a "pending" en cuanto la API vuelve a dar una fecha confirmada
// (SCHEDULED/TIMED). CANCELLED se trata igual que POSTPONED: confirmado contra la API real
// que football-data.org lo usa también para partidos aplazados sin nueva fecha todavía (no
// solo para cancelaciones definitivas). Ojo: la API manda un marcador placeholder (0-0) para
// estos partidos y seguimos guardándolo tal cual en `homeScore`/`awayScore` — no afecta a la
// UI (un partido `postponed` nunca se pinta como en juego ni puntúa), pero queda como dato
// sucio en la BD; si se quiere limpiar de raíz, habría que dejar de fiarse del marcador salvo
// cuando `apiStatus === 'FINISHED'`.
// IN_PLAY/PAUSED se dejan sin mapeo propio (quedan como estaban, normalmente "pending" con
// el partido ya empezado) — es justo lo que queremos: un partido en juego debe seguir
// tratándose como bloqueado/en vivo, no como editable. SUSPENDED igual: ya empezó de verdad
// (puede que con goles ya marcados), así que no debe reabrir las predicciones aunque se
// interrumpa — distinto de un aplazamiento ANTES del kickoff.
function toMatchStatus(
  apiStatus: FootballDataMatch['status'],
  existingStatus: MatchStatus | undefined
): MatchStatus | undefined {
  if (existingStatus === 'finished' && apiStatus !== 'FINISHED') return undefined;
  if (apiStatus === 'FINISHED') return 'finished';
  if (apiStatus === 'POSTPONED' || apiStatus === 'CANCELLED') return 'postponed';
  if (apiStatus === 'SCHEDULED' || apiStatus === 'TIMED') return 'pending';
  return undefined;
}

export async function syncLaLigaMatches(season: string): Promise<SyncMatchesResult> {
  const apiMatches = await fetchLaLigaMatches(toSeasonStartYear(season));

  let created = 0;
  let updated = 0;
  let rescored = 0;

  for (const apiMatch of apiMatches) {
    const existing = await Match.findOne({ externalId: apiMatch.id })
      .select('status homeScore awayScore matchday season');

    const newHome = apiMatch.score.fullTime.home ?? undefined;
    const newAway = apiMatch.score.fullTime.away ?? undefined;

    // football-data.org a veces corrige un resultado después de haberlo dado ya por bueno
    // (ej. revisión de un gol). Si el partido ya estaba finalizado y el marcador cambia de
    // verdad, hay que reabrir las predicciones ya puntuadas para que se recalculen.
    const scoreCorrected = !!existing && existing.status === 'finished'
      && newHome != null && newAway != null
      && (existing.homeScore !== newHome || existing.awayScore !== newAway);

    await Match.findOneAndUpdate(
      { externalId: apiMatch.id },
      {
        externalId: apiMatch.id,
        season,
        competition: 'la_liga',
        matchday: apiMatch.matchday,
        isKnockout: false,
        homeTeam: apiMatch.homeTeam.name,
        awayTeam: apiMatch.awayTeam.name,
        homeCrest: apiMatch.homeTeam.crest,
        awayCrest: apiMatch.awayTeam.crest,
        startTime: new Date(apiMatch.utcDate),
        homeScore: newHome,
        awayScore: newAway,
        status: toMatchStatus(apiMatch.status, existing?.status),
      },
      { upsert: true }
    );

    if (scoreCorrected) {
      await reopenMatchForRescoring({
        _id: existing!._id as Types.ObjectId,
        season: existing!.season,
        matchday: existing!.matchday,
      } as IMatch & { _id: Types.ObjectId });
      rescored++;
    }

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { processed: apiMatches.length, created, updated, rescored };
}
