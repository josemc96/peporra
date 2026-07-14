import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { requireGroupMember } from '../services/groupAuth.service';

export async function getMatchPredictionVisibility(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const matchId = req.params.matchId as string;

  const group = await requireGroupMember(groupId, req.user!.id);
  const memberIds = group.members.map((m) => m.toString());

  const match = await Match.findById(matchId);
  if (!match) throw new AppError('Partido no encontrado', 404);

  const users = await User.find({ _id: { $in: memberIds } }).select('alias');
  const userById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u.alias]));

  const now = new Date();
  const kickoff = new Date(match.startTime);

  // ── Before kickoff: only reveal who has predicted, not what ──────────────
  // Exception: rueda_prensa plays force-reveal a specific user's prediction
  if (now < kickoff) {
    const predictions = await Prediction.find({ match: matchId, user: { $in: memberIds } }).select('user predictedHome predictedAway');
    const predictedUserIds = new Set(predictions.map((p) => p.user.toString()));
    const predByUser = new Map(predictions.map((p) => [p.user.toString(), p]));

    // Detect rueda_prensa plays targeting members for this match
    const ruedaTargets = new Set<string>();
    if (match.matchday != null) {
      const deals = await CardDeal.find({ group: groupId, season: match.season, matchday: match.matchday, status: 'played' });
      const dealIds = deals.map((d) => d._id);
      const dealCardMap = new Map(deals.map((d) => [d._id.toString(), d.card]));
      const plays = await CardPlay.find({ deal: { $in: dealIds }, targetMatch: match._id });
      for (const play of plays) {
        if (dealCardMap.get(play.deal.toString()) === 'rueda_prensa' && play.targetUser) {
          ruedaTargets.add(play.targetUser.toString());
        }
      }
    }

    const members = memberIds.map((id) => {
      const pred = predByUser.get(id);
      const revealed = ruedaTargets.has(id) && pred
        ? { predictedHome: pred.predictedHome, predictedAway: pred.predictedAway }
        : undefined;
      return {
        user: { id, alias: userById.get(id) ?? id },
        hasPredicted: predictedUserIds.has(id),
        revealedPrediction: revealed,
      };
    });

    // Not predicted first, then predicted (revealed ones mixed in)
    members.sort((a, b) => Number(a.hasPredicted) - Number(b.hasPredicted));

    res.json({ phase: 'upcoming', members });
    return;
  }

  // ── After kickoff: reveal predictions grouped by result ──────────────────
  const predictions = await Prediction.find({ match: matchId, user: { $in: memberIds } }).select('user predictedHome predictedAway');
  const predictedUserIds = new Set(predictions.map((p) => p.user.toString()));
  const noPrediction = memberIds
    .filter((id) => !predictedUserIds.has(id))
    .map((id) => ({ id, alias: userById.get(id) ?? id }));

  // Group predictions by result
  const groupMap = new Map<string, { predictedHome: number; predictedAway: number; users: { id: string; alias: string }[]; predictionIds: string[] }>();
  for (const pred of predictions) {
    const key = `${pred.predictedHome}-${pred.predictedAway}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { predictedHome: pred.predictedHome, predictedAway: pred.predictedAway, users: [], predictionIds: [] });
    }
    const entry = groupMap.get(key)!;
    entry.users.push({ id: pred.user.toString(), alias: userById.get(pred.user.toString()) ?? pred.user.toString() });
    entry.predictionIds.push(pred._id.toString());
  }

  if (match.status !== 'finished') {
    const groups = [...groupMap.values()].map(({ predictedHome, predictedAway, users }) => ({ predictedHome, predictedAway, users }));
    res.json({ phase: 'live', groups, noPrediction });
    return;
  }

  // ── Finished: add points per user ────────────────────────────────────────
  const allPredictionIds = predictions.map((p) => p._id);
  const scores = await PredictionScore.find({ group: groupId, prediction: { $in: allPredictionIds } }).select('prediction points');
  const pointsByPrediction = new Map(scores.map((s) => [s.prediction.toString(), s.points]));

  // Build a map from userId → predictionId for this match
  const predIdByUser = new Map(predictions.map((p) => [p.user.toString(), p._id.toString()]));

  const groups = [...groupMap.values()].map(({ predictedHome, predictedAway, users, predictionIds }) => {
    const usersWithPoints = users.map((u) => {
      const predId = predIdByUser.get(u.id);
      const pts = predId != null ? (pointsByPrediction.get(predId) ?? null) : null;
      return { ...u, points: pts };
    });
    // Group-level best points (for sort order): max individual score
    const maxPoints = usersWithPoints.reduce((mx, u) => Math.max(mx, u.points ?? 0), 0);
    return { predictedHome, predictedAway, users: usersWithPoints, points: maxPoints };
  });

  // Sort: higher points first
  groups.sort((a, b) => b.points - a.points);

  res.json({
    phase: 'finished',
    realHome: match.homeScore,
    realAway: match.awayScore,
    groups,
    noPrediction,
  });
}
