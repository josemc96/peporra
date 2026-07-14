import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { CardDeal } from '../models/CardDeal';
import { CardPlay, ICardPlayParams } from '../models/CardPlay';
import { CardConfig } from '../models/CardConfig';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
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

    // ── El VAR: rival + finished match + side + delta ───────────────────
    case 'el_var': {
      if (!matchId) throw new AppError('matchId es obligatorio', 400);
      if (!targetUserId) throw new AppError('targetUserId es obligatorio', 400);
      assertNotSelf(userId, targetUserId);
      assertIsMember(group, targetUserId);
      const { side, delta } = params as { side?: string; delta?: number };
      if (side !== 'home' && side !== 'away') throw new AppError('side debe ser "home" o "away"', 400);
      if (delta !== 1 && delta !== -1) throw new AppError('delta debe ser 1 o -1', 400);
      const match = await resolveMatch(matchId);
      assertFinished(match);
      // Check rival has a prediction for this match
      const pred = await Prediction.findOne({ user: targetUserId, match: matchId });
      if (!pred) throw new AppError('El rival no tiene predicción en este partido', 404);
      // Apply the VAR change to the stored prediction
      if (side === 'home') {
        const newVal = pred.predictedHome + delta;
        if (newVal < 0) throw new AppError('El marcador no puede ser negativo', 400);
        pred.predictedHome = newVal;
      } else {
        const newVal = pred.predictedAway + delta;
        if (newVal < 0) throw new AppError('El marcador no puede ser negativo', 400);
        pred.predictedAway = newVal;
      }
      pred.status = 'pending'; // reset so scoring re-runs
      await pred.save();
      return { targetUserId, targetMatchId: matchId, params: { side: side as 'home' | 'away', delta: delta as 1 | -1 } };
    }

    // ── El Espía: spy window (-30 min before kickoff) ───────────────────
    case 'el_espia': {
      if (!matchId) throw new AppError('matchId es obligatorio', 400);
      const match = await resolveMatch(matchId);
      const now = new Date();
      const kickoff = new Date(match.startTime);
      const windowOpen = new Date(kickoff.getTime() - 30 * 60 * 1000);
      if (now < windowOpen) throw new AppError('La ventana del Espía aún no ha abierto (faltan más de 30 minutos)', 400);
      if (now >= kickoff) throw new AppError('El partido ya ha empezado', 409);
      // Optional copy
      const { copiedUserId } = params as { copiedUserId?: string };
      if (copiedUserId) {
        assertIsMember(group, copiedUserId);
        assertNotSelf(userId, copiedUserId);
        const sourcePred = await Prediction.findOne({ user: copiedUserId, match: matchId });
        if (!sourcePred) throw new AppError('El jugador copiado no tiene predicción en este partido', 404);
        await Prediction.findOneAndUpdate(
          { user: userId, match: matchId },
          { user: new Types.ObjectId(userId), match: new Types.ObjectId(matchId), predictedHome: sourcePred.predictedHome, predictedAway: sourcePred.predictedAway, status: 'pending' },
          { upsert: true, new: true }
        );
      }
      return { targetMatchId: matchId, params: { copiedUserId } };
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

// ── Espía spy window (read-only) ───────────────────────────────────────────

export async function spyMatch(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const matchId = req.params.matchId as string;
  const userId = req.user!.id;

  const group = await requireGroupMember(groupId, userId);

  const match = await resolveMatch(matchId);
  const now = new Date();
  const kickoff = new Date(match.startTime);
  const windowOpen = new Date(kickoff.getTime() - 30 * 60 * 1000);

  if (now < windowOpen) throw new AppError('La ventana del Espía aún no ha abierto', 400);
  if (now >= kickoff) throw new AppError('El partido ya ha empezado', 409);

  // User must have an unused Espía card for this matchday
  const espíaDeal = await CardDeal.findOne({
    group: groupId,
    season: match.season,
    matchday: match.matchday,
    user: userId,
    card: 'el_espia',
    status: 'pending',
  });
  if (!espíaDeal) throw new AppError('No tienes carta de Espía disponible para esta jornada', 403);

  const memberIds = group.members.map((m) => m.toString());
  const predictions = await Prediction.find({ match: matchId, user: { $in: memberIds } })
    .populate('user', 'alias');

  res.json({ predictions: predictions.map((p) => ({
    user: { id: (p.user as any)._id, alias: (p.user as any).alias },
    predictedHome: p.predictedHome,
    predictedAway: p.predictedAway,
  })) });
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
