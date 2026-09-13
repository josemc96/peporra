import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { CardDeal } from '../models/CardDeal';
import { CardPlay, ICardPlayParams } from '../models/CardPlay';
import { CardConfig } from '../models/CardConfig';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { requireGroupMember } from '../services/groupAuth.service';
import { CardKey } from '../types/enums';

// ── helpers ────────────────────────────────────────────────────────────────

async function resolveDeal(dealId: string, userId: string, groupId: string) {
  const deal = await CardDeal.findById(dealId);
  if (!deal) throw new AppError('Carta no encontrada', 404);
  if (deal.user.toString() !== userId) throw new AppError('Esta carta no es tuya', 403);
  if (deal.group.toString() !== groupId) throw new AppError('La carta no pertenece a esta peña', 403);
  if (deal.status === 'played') throw new AppError('Esta carta ya fue jugada', 409);
  if (deal.status === 'expired') throw new AppError('Esta carta ha expirado', 409);
  return deal;
}

async function resolveMatch(matchId: string) {
  const match = await Match.findById(matchId);
  if (!match) throw new AppError('Partido no encontrado', 404);
  return match;
}

function assertBeforeKickoff(match: InstanceType<typeof Match>) {
  if (new Date() >= new Date(match.startTime)) {
    throw new AppError('El partido ya ha empezado', 409);
  }
}

function assertFinished(match: InstanceType<typeof Match>) {
  if (match.status !== 'finished') {
    throw new AppError('El partido aún no ha terminado', 409);
  }
}

function assertIsMember(group: { members: Types.ObjectId[] }, targetUserId: string) {
  if (!group.members.some((m) => m.toString() === targetUserId)) {
    throw new AppError('El usuario no es miembro de esta peña', 400);
  }
}

function assertNotSelf(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new AppError('No puedes usar esta carta sobre ti mismo', 400);
}

// ── per-card validation ────────────────────────────────────────────────────

async function validatePlay(
  card: CardKey,
  body: Record<string, unknown>,
  userId: string,
  group: { members: Types.ObjectId[] },
  deal: InstanceType<typeof CardDeal>
): Promise<{ targetUserId?: string; targetMatchId?: string; params: ICardPlayParams }> {

  const { matchId, targetUserId, params = {} } = body as {
    matchId?: string;
    targetUserId?: string;
    params?: ICardPlayParams;
  };

  switch (card) {
    // ── Cards targeting your own prediction on a match ──────────────────
    case 'la_mina':
    case 'el_autobus':
    case 'el_doblete': {
      if (!matchId) throw new AppError('matchId es obligatorio para esta carta', 400);
      const match = await resolveMatch(matchId);
      assertBeforeKickoff(match);
      if (match.matchday !== deal.matchday) throw new AppError('El partido no pertenece a la jornada de la carta', 400);
      const hasPred = await Prediction.findOne({ user: userId, match: matchId });
      if (!hasPred) throw new AppError('Debes tener una predicción para este partido antes de usar esta carta', 400);
      return { targetMatchId: matchId, params: {} };
    }

    // ── Cards targeting a rival on a specific match ─────────────────────
    case 'la_roja':
    case 'la_lesion':
    case 'rueda_prensa': {
      if (!matchId) throw new AppError('matchId es obligatorio', 400);
      if (!targetUserId) throw new AppError('targetUserId es obligatorio', 400);
      assertNotSelf(userId, targetUserId);
      assertIsMember(group, targetUserId);
      const match = await resolveMatch(matchId);
      assertBeforeKickoff(match);
      if (match.matchday !== deal.matchday) throw new AppError('El partido no pertenece a la jornada de la carta', 400);
      return { targetUserId, targetMatchId: matchId, params: {} };
    }

    // ── El VAR: self-buff before kickoff — ±1 miss on one side counts as exact ──
    case 'el_var': {
      if (!matchId) throw new AppError('matchId es obligatorio', 400);
      const match = await resolveMatch(matchId);
      assertBeforeKickoff(match);
      if (match.matchday !== deal.matchday) throw new AppError('El partido no pertenece a la jornada de la carta', 400);
      return { targetMatchId: matchId, params: {} };
    }

    // ── El Espía: se juega directamente sobre un partido antes del kickoff;
    // las predicciones de la peña se consultan después (getMySpyResults) ────
    case 'el_espia': {
      if (!matchId) throw new AppError('matchId es obligatorio', 400);
      const match = await resolveMatch(matchId);
      if (new Date() >= new Date(match.startTime)) throw new AppError('El partido ya ha empezado', 409);
      return { targetMatchId: matchId, params: {} };
    }

    // ── Me la Juego: bet on exact score ────────────────────────────────
    case 'me_la_juego': {
      if (!matchId) throw new AppError('matchId es obligatorio', 400);
      const { amount } = params as { amount?: number };
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
        throw new AppError('params.amount debe ser un entero positivo', 400);
      }
      const config = await CardConfig.findOne({ group: deal.group, season: deal.season });
      if (config && amount > config.melaJuegoLimit) {
        throw new AppError(`La apuesta máxima es ${config.melaJuegoLimit} pts`, 400);
      }
      const match = await resolveMatch(matchId);
      assertBeforeKickoff(match);
      if (match.matchday !== deal.matchday) throw new AppError('El partido no pertenece a la jornada de la carta', 400);
      return { targetMatchId: matchId, params: { amount } };
    }

    // ── La Afición: support a teammate for the full matchday ───────────
    case 'la_aficion': {
      if (!targetUserId) throw new AppError('targetUserId es obligatorio', 400);
      assertNotSelf(userId, targetUserId);
      assertIsMember(group, targetUserId);
      // Matchday must not have started (first match of matchday)
      const firstMatch = await Match.findOne({
        competition: 'la_liga', season: deal.season, matchday: deal.matchday,
      }).sort({ startTime: 1 });
      if (firstMatch && new Date() >= new Date(firstMatch.startTime)) {
        throw new AppError('La jornada ya ha empezado', 409);
      }
      return { targetUserId, params: {} };
    }

    default:
      throw new AppError(`Carta desconocida: ${card}`, 400);
  }
}

// ── Main play endpoint ─────────────────────────────────────────────────────

export async function playCard(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const userId = req.user!.id;
  const { dealId, ...rest } = req.body as { dealId: string } & Record<string, unknown>;

  if (!dealId) throw new AppError('dealId es obligatorio', 400);

  const group = await requireGroupMember(groupId, userId);
  const deal = await resolveDeal(dealId, userId, groupId);

  const { targetUserId, targetMatchId, params } = await validatePlay(
    deal.card,
    rest,
    userId,
    group,
    deal
  );

  const play = await CardPlay.create({
    deal: deal._id,
    ...(targetUserId && { targetUser: new Types.ObjectId(targetUserId) }),
    ...(targetMatchId && { targetMatch: new Types.ObjectId(targetMatchId) }),
    params,
  });

  deal.status = 'played';
  await deal.save();

  res.status(201).json({ play, deal });
}

// ── Get active (revealed) card plays for a matchday ───────────────────────

export async function getActiveCardPlays(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday } = req.query as { season?: string; matchday?: string };
  if (!season || !matchday) throw new AppError('season y matchday son obligatorios', 400);

  await requireGroupMember(groupId, req.user!.id);

  // Only return plays for deals in this group/season/matchday
  const deals = await CardDeal.find({
    group: groupId, season, matchday: parseInt(matchday, 10), status: 'played',
  }).select('_id card user');

  const dealIds = deals.map((d) => d._id);
  const plays = await CardPlay.find({ deal: { $in: dealIds } })
    .populate({ path: 'deal', select: 'card user', populate: { path: 'user', select: 'alias' } })
    .populate('targetUser', 'alias')
    .populate('targetMatch', 'homeTeam awayTeam startTime matchday');

  // Only reveal cards whose match has started (or no match = La Afición)
  const now = new Date();
  const revealed = plays.filter((p) => {
    const card = (p.deal as any).card as CardKey;
    if (card === 'la_aficion' || card === 'me_la_juego' || card === 'el_doblete') return true;
    if (card === 'el_var') return true; // post-match, always visible
    const targetMatch = p.targetMatch as any;
    if (!targetMatch) return true;
    return now >= new Date(targetMatch.startTime);
  });

  res.json({ plays: revealed });
}

// ── Resultados de El Espía ya jugado ───────────────────────────────────────

// Para cada partido donde el usuario ya jugó El Espía (independientemente de si el
// partido ya empezó), las predicciones de la peña que vio en ese momento — a diferencia
// de spyMatch (que solo funciona MIENTRAS la carta está pendiente, antes de jugarla),
// esto sirve para volver a consultar lo que ya se espió, en cualquier momento después.
export async function getMySpyResults(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  const group = await requireGroupMember(groupId, req.user!.id);
  const memberIds = group.members.map((m) => m.toString());

  const deals = await CardDeal.find({ group: groupId, season, user: req.user!.id, card: 'el_espia', status: 'played' })
    .select('_id');
  if (deals.length === 0) {
    res.json({ results: {} });
    return;
  }

  const plays = await CardPlay.find({ deal: { $in: deals.map((d) => d._id) }, targetMatch: { $exists: true } })
    .select('targetMatch');
  const matchIds = plays.map((p) => p.targetMatch!);
  if (matchIds.length === 0) {
    res.json({ results: {} });
    return;
  }

  const predictions = await Prediction.find({
    group: groupId,
    match: { $in: matchIds },
    user: { $in: memberIds },
  }).select('user match predictedHome predictedAway');

  const users = await User.find({ _id: { $in: memberIds } }).select('alias');
  const aliasById = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u.alias]));

  const results: Record<string, { alias: string; predictedHome: number; predictedAway: number }[]> = {};
  for (const pred of predictions) {
    const matchId = pred.match.toString();
    if (!results[matchId]) results[matchId] = [];
    results[matchId].push({
      alias: aliasById.get(pred.user.toString()) ?? pred.user.toString(),
      predictedHome: pred.predictedHome,
      predictedAway: pred.predictedAway,
    });
  }

  res.json({ results });
}
