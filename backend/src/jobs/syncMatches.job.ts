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

// Solo confirma "finished" cuando la API lo dice; si no, no se incluye el campo en el
// update (queda `undefined` y Mongoose lo omite del $set) para no pisar un partido que ya
// se marcó "finished" a mano si football-data.org va con retraso en reflejar el resultado.
function toMatchStatus(apiStatus: FootballDataMatch['status']): MatchStatus | undefined {
  return apiStatus === 'FINISHED' ? 'finished' : undefined;
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
        status: toMatchStatus(apiMatch.status),
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
