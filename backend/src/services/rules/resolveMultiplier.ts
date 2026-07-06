import { Types } from 'mongoose';
import { ScoreMultiplier } from '../../models/ScoreMultiplier';

// Precedencia: multiplicador de partido concreto > multiplicador de jornada completa.
export async function resolveMultiplier(
  group: Types.ObjectId,
  match: Types.ObjectId,
  matchday: number | undefined
): Promise<number> {
  const matchScoped = await ScoreMultiplier.findOne({ group, scope: 'match', match });
  if (matchScoped) return matchScoped.multiplier;

  if (matchday !== undefined) {
    const matchdayScoped = await ScoreMultiplier.findOne({ group, scope: 'matchday', matchday });
    if (matchdayScoped) return matchdayScoped.multiplier;
  }

  return 1;
}
