import { fetchLaLigaMatches, FootballDataMatch } from '../services/footballApi.service';
import { Match } from '../models/Match';
import { MatchStatus } from '../types/enums';

export interface SyncMatchesResult {
  processed: number;
  created: number;
  updated: number;
}

function toSeasonStartYear(season: string): string {
  // "2026-2027" -> "2026" (formato que espera football-data.org)
  return season.split('-')[0];
}

function toMatchStatus(apiStatus: FootballDataMatch['status']): MatchStatus {
  return apiStatus === 'FINISHED' ? 'finished' : 'pending';
}

export async function syncLaLigaMatches(season: string): Promise<SyncMatchesResult> {
  const apiMatches = await fetchLaLigaMatches(toSeasonStartYear(season));

  let created = 0;
  let updated = 0;

  for (const apiMatch of apiMatches) {
    const existed = await Match.exists({ externalId: apiMatch.id });

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
        startTime: new Date(apiMatch.utcDate),
        homeScore: apiMatch.score.fullTime.home ?? undefined,
        awayScore: apiMatch.score.fullTime.away ?? undefined,
        status: toMatchStatus(apiMatch.status),
      },
      { upsert: true }
    );

    if (existed) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { processed: apiMatches.length, created, updated };
}
