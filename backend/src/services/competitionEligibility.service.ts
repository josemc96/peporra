import { Types } from 'mongoose';
import { GroupRuleSettings } from '../models/GroupRuleSettings';
import { Competition } from '../types/enums';

// La Liga siempre puntúa; Copa del Rey/Supercopa son opt-in por peña (enabledCompetitions).
export async function isCompetitionEnabledForGroup(
  group: Types.ObjectId,
  season: string,
  competition: Competition
): Promise<boolean> {
  if (competition === 'la_liga') return true;

  const settings = await GroupRuleSettings.findOne({ group, season });
  return settings?.enabledCompetitions.includes(competition) ?? false;
}
