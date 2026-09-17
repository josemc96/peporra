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
// (SCHEDULED/TIMED). El resto de estados (IN_PLAY/PAUSED/SUSPENDED/CANCELLED) no tienen
// mapeo propio todavía: se dejan `undefined` (sin tocar) — un partido suspendido a mitad de
// juego, por ejemplo, ya queda bloqueado igualmente porque su `startTime` real ya pasó.
function toMatchStatus(
  apiStatus: FootballDataMatch['status'],
  existingStatus: MatchStatus | undefined
): MatchStatus | undefined {
  if (existingStatus === 'finished' && apiStatus !== 'FINISHED') return undefined;
  if (apiStatus === 'FINISHED') return 'finished';
  if (apiStatus === 'POSTPONED') return 'postponed';
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
