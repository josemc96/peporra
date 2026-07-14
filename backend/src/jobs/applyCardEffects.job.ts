import { Types } from 'mongoose';
import { Group } from '../models/Group';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { CardConfig } from '../models/CardConfig';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { CardEffect } from '../models/CardEffect';
import { CardKey } from '../types/enums';

// ── types ──────────────────────────────────────────────────────────────────

interface MatchEffects {
  autobusUsers: Set<string>;
  minaPlays: Array<{ ownerId: string; home: number; away: number }>;
  rojaTargets: Set<string>;
  lesionTargets: Set<string>;
  dobleUsers: Set<string>;
  melaJuegoPlays: Array<{ userId: string; matchId: string; amount: number }>;
}

interface AficionPlay {
  supporterId: string;
  targetId: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

async function loadMatchdayCardPlays(
  groupId: Types.ObjectId,
  season: string,
  matchday: number
): Promise<{ matchEffects: Map<string, MatchEffects>; aficionPlays: AficionPlay[] }> {

  const deals = await CardDeal.find({ group: groupId, season, matchday, status: 'played' });
  const dealIds = deals.map((d) => d._id);
  const dealMap = new Map(deals.map((d) => [d._id.toString(), d]));

  const plays = await CardPlay.find({ deal: { $in: dealIds } });

  const matchEffects = new Map<string, MatchEffects>();
  const aficionPlays: AficionPlay[] = [];

  function getMatchEffects(matchId: string): MatchEffects {
    if (!matchEffects.has(matchId)) {
      matchEffects.set(matchId, {
        autobusUsers: new Set(),
        minaPlays: [],
        rojaTargets: new Set(),
        lesionTargets: new Set(),
        dobleUsers: new Set(),
        melaJuegoPlays: [],
      });
    }
    return matchEffects.get(matchId)!;
  }

  for (const play of plays) {
    const deal = dealMap.get(play.deal.toString());
    if (!deal) continue;
    const card = deal.card as CardKey;
    const userId = deal.user.toString();
    const matchId = play.targetMatch?.toString();

    switch (card) {
      case 'el_autobus':
        if (matchId) getMatchEffects(matchId).autobusUsers.add(userId);
        break;
      case 'la_mina': {
        if (!matchId) break;
        // Need the owner's prediction for that match to know the "dangerous" score
        // We'll resolve this lazily when processing
        const effects = getMatchEffects(matchId);
        effects.minaPlays.push({ ownerId: userId, home: -1, away: -1 }); // scores resolved below
        break;
      }
      case 'la_roja':
        if (matchId && play.targetUser) getMatchEffects(matchId).rojaTargets.add(play.targetUser.toString());
        break;
      case 'la_lesion':
        if (matchId && play.targetUser) getMatchEffects(matchId).lesionTargets.add(play.targetUser.toString());
        break;
      case 'el_doblete':
        if (matchId) getMatchEffects(matchId).dobleUsers.add(userId);
        break;
      case 'me_la_juego':
        if (matchId && play.params?.amount != null) {
          getMatchEffects(matchId).melaJuegoPlays.push({ userId, matchId, amount: play.params.amount as number });
        }
        break;
      case 'la_aficion':
        if (play.targetUser) {
          aficionPlays.push({ supporterId: userId, targetId: play.targetUser.toString() });
        }
        break;
    }
  }

  return { matchEffects, aficionPlays };
}

// Resolve mina "dangerous" scores from actual predictions
async function resolveMinas(
  minaPlays: Array<{ ownerId: string; home: number; away: number }>,
  matchId: string
): Promise<void> {
  for (const mina of minaPlays) {
    const pred = await Prediction.findOne({ user: mina.ownerId, match: matchId });
    if (pred) { mina.home = pred.predictedHome; mina.away = pred.predictedAway; }
  }
}

// ── per-match card effect application ─────────────────────────────────────

async function applyMatchEffects(
  groupId: Types.ObjectId,
  match: InstanceType<typeof Match>,
  effects: MatchEffects
): Promise<void> {

  await resolveMinas(effects.minaPlays, match._id.toString());

  // Load all predictions for this match from group members
  const group = await Group.findById(groupId).select('members');
  if (!group) return;
  const memberIds = group.members.map((m) => m.toString());

  const predictions = await Prediction.find({
    match: match._id,
    user: { $in: memberIds },
  }).select('_id user predictedHome predictedAway');

  for (const pred of predictions) {
    const userId = pred.user.toString();

    const score = await PredictionScore.findOne({ prediction: pred._id, group: groupId });
    if (!score) continue;

    const preCard = score.preCardPoints;
    const basePoints = score.ruleBreakdown.reduce((s, r) => s + r.points, 0);
    let finalPoints = preCard;

    if (effects.autobusUsers.has(userId)) {
      // Immune + guaranteed 1 pt minimum
      finalPoints = Math.max(preCard, 1);
    } else {
      // Check if Mina applies (user prediction matches a mina's score, user is not the mina owner)
      const hitByMina = effects.minaPlays.some(
        (m) => m.ownerId !== userId && m.home >= 0 && m.home === pred.predictedHome && m.away === pred.predictedAway
      );

      const hitByRoja = effects.rojaTargets.has(userId);
      const hitByLesion = effects.lesionTargets.has(userId);
      const hasDoble = effects.dobleUsers.has(userId);

      if (hitByRoja || hitByMina) {
        // 0 pts — max damage (Roja and Mina both result in 0)
        finalPoints = 0;
      } else if (hitByLesion && hasDoble) {
        // Cancel each other out → preCardPoints unchanged
        finalPoints = preCard;
      } else if (hitByLesion) {
        finalPoints = Math.floor(preCard / 2);
      } else if (hasDoble) {
        // +1 to multiplier: add one extra "set of base points"
        finalPoints = preCard + basePoints;
      }
    }

    if (finalPoints !== score.points) {
      score.points = finalPoints;
      await score.save();
    }
  }
}

// ── Me la Juego resolution ─────────────────────────────────────────────────

async function processMelaJuego(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  matches: InstanceType<typeof Match>[],
  melaJuegoPlays: Array<{ userId: string; matchId: string; amount: number }>
): Promise<void> {

  const matchMap = new Map(matches.map((m) => [m._id.toString(), m]));

  for (const play of melaJuegoPlays) {
    const match = matchMap.get(play.matchId);
    if (!match || match.status !== 'finished') continue;

    const pred = await Prediction.findOne({ user: play.userId, match: play.matchId });
    if (!pred) continue;

    const claved = pred.predictedHome === match.homeScore && pred.predictedAway === match.awayScore;
    const points = claved ? play.amount : -Math.floor(play.amount / 2);

    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: play.userId, card: 'me_la_juego' },
      { group: groupId, season, matchday, user: new Types.ObjectId(play.userId), card: 'me_la_juego', points, sourceMatch: new Types.ObjectId(play.matchId) },
      { upsert: true }
    );
  }
}

// ── La Afición resolution ──────────────────────────────────────────────────

async function processLaAficion(
  groupId: Types.ObjectId,
  season: string,
  matchday: number,
  memberIds: string[],
  aficionPlays: AficionPlay[]
): Promise<void> {
  if (aficionPlays.length === 0) return;

  // Compute matchday PredictionScore ranking (post card effects)
  const matchIds = (await Match.find({ competition: 'la_liga', season, matchday }).select('_id')).map((m) => m._id);
  if (!matchIds.length) return;

  const predictions = await Prediction.find({ match: { $in: matchIds }, user: { $in: memberIds } }).select('_id user');
  const predIdsByUser = new Map<string, Types.ObjectId[]>();
  for (const p of predictions) {
    const uid = p.user.toString();
    if (!predIdsByUser.has(uid)) predIdsByUser.set(uid, []);
    predIdsByUser.get(uid)!.push(p._id as Types.ObjectId);
  }

  const matchdayPoints = new Map<string, number>(memberIds.map((id) => [id, 0]));
  for (const [uid, predIds] of predIdsByUser.entries()) {
    const scores = await PredictionScore.find({ prediction: { $in: predIds }, group: groupId }).select('points');
    matchdayPoints.set(uid, scores.reduce((s, sc) => s + sc.points, 0));
  }

  const sorted = [...matchdayPoints.entries()].sort((a, b) => b[1] - a[1]);
  const podium = new Set(sorted.slice(0, 3).map(([uid]) => uid));

  for (const { supporterId, targetId } of aficionPlays) {
    if (!podium.has(targetId)) continue;
    const targetPts = matchdayPoints.get(targetId) ?? 0;
    const bonus = Math.floor(targetPts / 2);
    if (bonus <= 0) continue;

    await CardEffect.findOneAndUpdate(
      { group: groupId, season, matchday, user: supporterId, card: 'la_aficion' },
      { group: groupId, season, matchday, user: new Types.ObjectId(supporterId), card: 'la_aficion', points: bonus },
      { upsert: true }
    );
  }
}

// ── Main job ───────────────────────────────────────────────────────────────

export async function applyCardEffects(season: string): Promise<{ matchdaysProcessed: number }> {
  const groups = await Group.find({ season }).select('_id members season');
  let matchdaysProcessed = 0;

  for (const group of groups) {
    const config = await CardConfig.findOne({ group: group._id, season });
    if (!config || config.enabledCards.length === 0) continue;

    // Find matchdays that are fully finished (all matches done)
    const allMatchdays = await Match.find({ competition: 'la_liga', season, matchday: { $ne: null } })
      .select('matchday status');

    const matchdayStatus = new Map<number, { total: number; finished: number }>();
    for (const m of allMatchdays) {
      const day = m.matchday!;
      const entry = matchdayStatus.get(day) ?? { total: 0, finished: 0 };
      entry.total++;
      if (m.status === 'finished') entry.finished++;
      matchdayStatus.set(day, entry);
    }

    const completedMatchdays = [...matchdayStatus.entries()]
      .filter(([, s]) => s.total > 0 && s.total === s.finished)
      .map(([day]) => day);

    for (const matchday of completedMatchdays) {
      const matches = await Match.find({ competition: 'la_liga', season, matchday, status: 'finished' });
      const { matchEffects, aficionPlays } = await loadMatchdayCardPlays(group._id as Types.ObjectId, season, matchday);

      // Apply match-level effects (Mina, Roja, Lesión, Autobús, Doblete)
      for (const match of matches) {
        const effects = matchEffects.get(match._id.toString());
        if (!effects) continue;
        await applyMatchEffects(group._id as Types.ObjectId, match, effects);
      }

      // Me la Juego CardEffects
      const allMelaJuego = [...matchEffects.values()].flatMap((e) => e.melaJuegoPlays);
      await processMelaJuego(group._id as Types.ObjectId, season, matchday, matches, allMelaJuego);

      // La Afición (needs post-effect ranking)
      const memberIds = group.members.map((m) => m.toString());
      await processLaAficion(group._id as Types.ObjectId, season, matchday, memberIds, aficionPlays);

      matchdaysProcessed++;
    }
  }

  return { matchdaysProcessed };
}
