import { fetchTopScorers } from '../services/footballApi.service';
import { Scorer } from '../models/Scorer';

export interface SyncScorersResult {
  processed: number;
}

function toSeasonStartYear(season: string): string {
  return season.split('-')[0];
}

export async function syncTopScorers(season: string, limit = 20): Promise<SyncScorersResult> {
  const apiScorers = await fetchTopScorers(toSeasonStartYear(season), limit);

  for (const entry of apiScorers) {
    await Scorer.findOneAndUpdate(
      { season, externalPlayerId: entry.player.id },
      {
        season,
        externalPlayerId: entry.player.id,
        playerName: entry.player.name,
        team: entry.team.name,
        goals: entry.goals,
        assists: entry.assists ?? undefined,
        penalties: entry.penalties ?? undefined,
        playedMatches: entry.playedMatches ?? undefined,
      },
      { upsert: true }
    );
  }

  return { processed: apiScorers.length };
}
