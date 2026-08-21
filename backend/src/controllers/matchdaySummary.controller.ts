import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Match, IMatch } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { requireGroupMember } from '../services/groupAuth.service';
import { Competition, CardKey } from '../types/enums';

const COMPETITION_LABEL: Record<Exclude<Competition, 'la_liga'>, string> = {
  copa_del_rey: 'Copa del Rey',
  supercopa: 'Supercopa de España',
};

function sign(h: number, a: number): number {
  return h > a ? 1 : h < a ? -1 : 0;
}

interface CardImpact {
  card: CardKey;
  byAlias?: string; // quién jugó la carta contra ti (Roja/Lesión/Mina); ausente si fue autobús/doblete propios
}

interface SummaryMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest?: string;
  awayCrest?: string;
  startTime: Date;
  homeScore: number;
  awayScore: number;
  predictedHome: number;
  predictedAway: number;
  points: number;
  preCardPoints: number;
  isExact: boolean;
  cardImpact: CardImpact | null;
}

interface SummaryGroup {
  key: string;
  label: string;
  totalPoints: number;
  earliestStartTime: Date;
  matches: SummaryMatch[];
}

export async function getMatchdaySummary(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const targetUserId = req.params.userId as string;
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  const group = await requireGroupMember(groupId, req.user!.id);
  const isTargetMember = group.members.some((m) => m.toString() === targetUserId);
  if (!isTargetMember) throw new AppError('El usuario no es miembro de esta peña', 404);

  const predictions = await Prediction.find({ user: targetUserId, group: groupId })
    .select('_id match predictedHome predictedAway');
  if (predictions.length === 0) {
    res.json({ groups: [] });
    return;
  }

  const matchIds = predictions.map((p) => p.match);
  const matches = await Match.find({ _id: { $in: matchIds }, season, status: 'finished' });
  const matchById = new Map(matches.map((m) => [(m._id as Types.ObjectId).toString(), m]));

  const scores = await PredictionScore.find({
    group: groupId,
    prediction: { $in: predictions.map((p) => p._id) },
  }).select('prediction points preCardPoints');
  const scoreByPrediction = new Map(scores.map((s) => [s.prediction.toString(), s]));

  // ── Reconstrucción del origen de las cartas: se resuelve por jornada, solo para
  // los partidos donde points !== preCardPoints (el resto no necesita atribución). ──
  const affectedMatchdays = new Set<number>();
  for (const pred of predictions) {
    const match = matchById.get(pred.match.toString());
    const score = scoreByPrediction.get((pred._id as Types.ObjectId).toString());
    if (match?.matchday != null && score && score.points !== score.preCardPoints) {
      affectedMatchdays.add(match.matchday);
    }
  }

  const cardImpactByMatch = new Map<string, CardImpact>();
  if (affectedMatchdays.size > 0) {
    const deals = await CardDeal.find({
      group: groupId, season, matchday: { $in: [...affectedMatchdays] }, status: 'played',
    }).select('_id user card');
    const dealMap = new Map(deals.map((d) => [(d._id as Types.ObjectId).toString(), d]));

    const plays = await CardPlay.find({ deal: { $in: deals.map((d) => d._id) } });

    const rojaLesionByKey = new Map<string, { card: CardKey; byUserId: string }>();
    const selfCardByKey = new Map<string, CardKey>();
    const minaLayersByMatch = new Map<string, string[]>();

    for (const play of plays) {
      const deal = dealMap.get(play.deal.toString());
      if (!deal || !play.targetMatch) continue;
      const matchId = play.targetMatch.toString();
      const ownerId = deal.user.toString();

      if ((deal.card === 'la_roja' || deal.card === 'la_lesion') && play.targetUser) {
        rojaLesionByKey.set(`${matchId}|${play.targetUser.toString()}`, { card: deal.card, byUserId: ownerId });
      } else if (deal.card === 'el_autobus' || deal.card === 'el_doblete') {
        selfCardByKey.set(`${matchId}|${ownerId}`, deal.card);
      } else if (deal.card === 'la_mina') {
        const arr = minaLayersByMatch.get(matchId) ?? [];
        arr.push(ownerId);
        minaLayersByMatch.set(matchId, arr);
      }
    }

    // Para la Mina hace falta comparar contra la predicción de quien la puso.
    const minaOwnerMatchPairs: { userId: string; matchId: string }[] = [];
    for (const [matchId, owners] of minaLayersByMatch.entries()) {
      for (const ownerId of owners) minaOwnerMatchPairs.push({ userId: ownerId, matchId });
    }
    const minaOwnerPredictions = minaOwnerMatchPairs.length > 0
      ? await Prediction.find({
          group: groupId,
          user: { $in: minaOwnerMatchPairs.map((p) => p.userId) },
          match: { $in: minaOwnerMatchPairs.map((p) => p.matchId) },
        }).select('user match predictedHome predictedAway')
      : [];
    const minaOwnerPredByKey = new Map(
      minaOwnerPredictions.map((p) => [`${p.match.toString()}|${p.user.toString()}`, p])
    );

    const attackerIds = new Set<string>();
    for (const v of rojaLesionByKey.values()) attackerIds.add(v.byUserId);
    for (const owners of minaLayersByMatch.values()) owners.forEach((o) => attackerIds.add(o));

    const users = await User.find({ _id: { $in: [...attackerIds] } }).select('alias');
    const aliasById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u.alias]));

    for (const pred of predictions) {
      const match = matchById.get(pred.match.toString());
      const score = scoreByPrediction.get((pred._id as Types.ObjectId).toString());
      if (!match || !score || score.points === score.preCardPoints) continue;
      const matchId = match._id.toString();
      const userKey = `${matchId}|${targetUserId}`;

      const direct = rojaLesionByKey.get(userKey);
      if (direct) {
        cardImpactByMatch.set(matchId, { card: direct.card, byAlias: aliasById.get(direct.byUserId) });
        continue;
      }
      const selfCard = selfCardByKey.get(userKey);
      if (selfCard) {
        cardImpactByMatch.set(matchId, { card: selfCard });
        continue;
      }
      const minaOwners = minaLayersByMatch.get(matchId) ?? [];
      for (const ownerId of minaOwners) {
        if (ownerId === targetUserId) continue;
        const ownerPred = minaOwnerPredByKey.get(`${matchId}|${ownerId}`);
        if (
          ownerPred &&
          ownerPred.predictedHome === pred.predictedHome &&
          ownerPred.predictedAway === pred.predictedAway &&
          match.homeScore === pred.predictedHome &&
          match.awayScore === pred.predictedAway
        ) {
          cardImpactByMatch.set(matchId, { card: 'la_mina', byAlias: aliasById.get(ownerId) });
          break;
        }
      }
    }
  }

  // ── Construcción de la respuesta agrupada por jornada/competición ──
  const groups = new Map<string, SummaryGroup>();

  function getGroup(key: string, label: string, matchStartTime: Date): SummaryGroup {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, totalPoints: 0, earliestStartTime: matchStartTime, matches: [] };
      groups.set(key, g);
    } else if (matchStartTime < g.earliestStartTime) {
      g.earliestStartTime = matchStartTime;
    }
    return g;
  }

  for (const pred of predictions) {
    const match = matchById.get(pred.match.toString()) as IMatch & { _id: Types.ObjectId } | undefined;
    if (!match) continue;
    const score = scoreByPrediction.get((pred._id as Types.ObjectId).toString());
    if (!score || match.homeScore == null || match.awayScore == null) continue;

    const key = match.competition === 'la_liga' ? `md-${match.matchday}` : match.competition;
    const label = match.competition === 'la_liga'
      ? `Jornada ${match.matchday}`
      : COMPETITION_LABEL[match.competition as Exclude<Competition, 'la_liga'>];

    const group = getGroup(key, label, match.startTime);
    group.totalPoints += score.points;

    const isCorrectSign = sign(pred.predictedHome, pred.predictedAway) === sign(match.homeScore, match.awayScore);
    if (!isCorrectSign) continue;

    group.matches.push({
      matchId: match._id.toString(),
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeCrest: match.homeCrest,
      awayCrest: match.awayCrest,
      startTime: match.startTime,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      predictedHome: pred.predictedHome,
      predictedAway: pred.predictedAway,
      points: score.points,
      preCardPoints: score.preCardPoints,
      isExact: pred.predictedHome === match.homeScore && pred.predictedAway === match.awayScore,
      cardImpact: cardImpactByMatch.get(match._id.toString()) ?? null,
    });
  }

  const result = Array.from(groups.values())
    .sort((a, b) => a.earliestStartTime.getTime() - b.earliestStartTime.getTime())
    .map(({ key, label, totalPoints, matches: ms }) => ({
      key, label, totalPoints,
      matches: ms.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    }));

  res.json({ groups: result });
}
