import { Types } from 'mongoose';
import { Group } from '../models/Group';
import { Match } from '../models/Match';
import { CardConfig } from '../models/CardConfig';
import { CardDeal } from '../models/CardDeal';
import { CardKey } from '../types/enums';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Deals one random card per member for matchdays whose first match starts
 * within the next 24 hours and haven't been dealt yet for each group.
 *
 * Optionally scoped to a single group (for manual admin trigger).
 */
export async function dealCards(groupIdFilter?: Types.ObjectId): Promise<{ dealt: number }> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find La Liga matchdays whose first match is within the next 24h
  const upcomingMatches = await Match.find({
    competition: 'la_liga',
    startTime: { $gte: now, $lte: in24h },
    matchday: { $ne: null },
  }).select('season matchday startTime');

  // Unique (season, matchday) pairs
  const pairs = new Map<string, { season: string; matchday: number }>();
  for (const m of upcomingMatches) {
    if (m.matchday == null) continue;
    const key = `${m.season}-${m.matchday}`;
    if (!pairs.has(key)) pairs.set(key, { season: m.season, matchday: m.matchday });
  }

  if (pairs.size === 0) return { dealt: 0 };

  const groupQuery = groupIdFilter ? { _id: groupIdFilter } : {};
  const groups = await Group.find(groupQuery).select('members season');

  let dealt = 0;

  for (const group of groups) {
    const config = await CardConfig.findOne({ group: group._id, season: group.season });
    if (!config || config.enabledCards.length === 0) continue;

    const enabledCards = config.enabledCards as CardKey[];

    for (const { season, matchday } of pairs.values()) {
      if (season !== group.season) continue;

      for (const userId of group.members) {
        const exists = await CardDeal.findOne({ group: group._id, season, matchday, user: userId });
        if (exists) continue;

        await CardDeal.create({
          group: group._id,
          season,
          matchday,
          user: userId,
          card: pickRandom(enabledCards),
          status: 'pending',
        });
        dealt++;
      }
    }
  }

  return { dealt };
}
