import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { CardConfig } from '../models/CardConfig';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { Match } from '../models/Match';
import { AppError } from '../utils/AppError';
import { requireGroupMember, requireGroupAdmin } from '../services/groupAuth.service';
import { dealCards } from '../jobs/dealCards.job';
import { ALL_CARD_KEYS, CardKey } from '../types/enums';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Config ─────────────────────────────────────────────────────────────────

export async function getCardConfig(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  await requireGroupMember(groupId, req.user!.id);

  const config = await CardConfig.findOne({ group: groupId, season });
  res.json({ config: config ?? null });
}

export async function updateCardConfig(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, enabledCards, melaJuegoLimit } = req.body as {
    season: string;
    enabledCards: CardKey[];
    melaJuegoLimit?: number;
  };

  if (!season) throw new AppError('season es obligatorio', 400);
  if (!Array.isArray(enabledCards)) throw new AppError('enabledCards debe ser un array', 400);

  const invalid = enabledCards.filter((k) => !ALL_CARD_KEYS.includes(k));
  if (invalid.length) throw new AppError(`Cartas desconocidas: ${invalid.join(', ')}`, 400);

  if (melaJuegoLimit !== undefined && (typeof melaJuegoLimit !== 'number' || melaJuegoLimit < 1)) {
    throw new AppError('melaJuegoLimit debe ser un número >= 1', 400);
  }

  await requireGroupAdmin(groupId, req.user!.id);

  const config = await CardConfig.findOneAndUpdate(
    { group: groupId, season },
    { $set: { enabledCards, ...(melaJuegoLimit !== undefined && { melaJuegoLimit }) } },
    { upsert: true, new: true }
  );

  res.json({ config });
}

// ── Deals ──────────────────────────────────────────────────────────────────

export async function getMyDeal(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday } = req.query as { season?: string; matchday?: string };
  if (!season || !matchday) throw new AppError('season y matchday son obligatorios', 400);

  await requireGroupMember(groupId, req.user!.id);

  const deal = await CardDeal.findOne({
    group: groupId,
    season,
    matchday: parseInt(matchday, 10),
    user: req.user!.id,
  });

  // Include play details if the card has been played
  const play = deal?.status === 'played'
    ? await CardPlay.findOne({ deal: deal._id })
    : null;

  res.json({ deal: deal ?? null, play: play ?? null });
}

export async function getAllDeals(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday } = req.query as { season?: string; matchday?: string };
  if (!season || !matchday) throw new AppError('season y matchday son obligatorios', 400);

  await requireGroupAdmin(groupId, req.user!.id);

  const deals = await CardDeal.find({
    group: groupId,
    season,
    matchday: parseInt(matchday, 10),
  }).populate('user', 'alias email');

  res.json({ deals });
}

// ── Manual deal trigger ────────────────────────────────────────────────────

export async function triggerDeal(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday } = req.body as { season?: string; matchday?: number };
  if (!season || !matchday) throw new AppError('season y matchday son obligatorios', 400);

  const group = await requireGroupAdmin(groupId, req.user!.id);

  const config = await CardConfig.findOne({ group: groupId, season });
  if (!config || config.enabledCards.length === 0) {
    throw new AppError('No hay cartas habilitadas para esta peña', 400);
  }

  const enabledCards = config.enabledCards as CardKey[];
  let dealt = 0;

  for (const userId of group.members) {
    const exists = await CardDeal.findOne({ group: groupId, season, matchday, user: userId });
    if (exists) continue;

    await CardDeal.create({
      group: new Types.ObjectId(groupId),
      season,
      matchday,
      user: userId,
      card: pickRandom(enabledCards),
      status: 'locked',
    });
    dealt++;
  }

  res.json({ dealt });
}

// ── Redeal ─────────────────────────────────────────────────────────────────

export async function redealUser(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday, userId } = req.body as {
    season: string;
    matchday: number;
    userId: string;
  };
  if (!season || !matchday || !userId) throw new AppError('season, matchday y userId son obligatorios', 400);

  await requireGroupAdmin(groupId, req.user!.id);

  const config = await CardConfig.findOne({ group: groupId, season });
  if (!config || config.enabledCards.length === 0) throw new AppError('No hay cartas habilitadas', 400);

  const deal = await CardDeal.findOne({ group: groupId, season, matchday, user: userId });
  if (!deal) throw new AppError('El usuario no tiene carta en esta jornada', 404);
  if (deal.status === 'played') throw new AppError('La carta ya fue jugada, no se puede cambiar', 409);
  if (deal.status === 'expired') throw new AppError('La carta ha expirado, no se puede cambiar', 409);

  deal.card = pickRandom(config.enabledCards as CardKey[]);
  deal.status = 'pending';
  await deal.save();

  res.json({ deal });
}

// ── Unlock (reveal) a locked card ─────────────────────────────────────────

export async function unlockCard(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const userId = req.user!.id;
  const { dealId } = req.body as { dealId?: string };
  if (!dealId) throw new AppError('dealId es obligatorio', 400);

  await requireGroupMember(groupId, userId);

  const deal = await CardDeal.findById(dealId);
  if (!deal) throw new AppError('Carta no encontrada', 404);
  if (deal.user.toString() !== userId) throw new AppError('Esta carta no es tuya', 403);
  if (deal.group.toString() !== groupId) throw new AppError('La carta no pertenece a esta peña', 403);
  if (deal.status !== 'locked') {
    if (deal.status === 'expired') throw new AppError('Esta carta ha expirado', 409);
    throw new AppError('La carta ya está desbloqueada', 409);
  }

  // Deadline: before the LAST match of this matchday starts
  const lastMatch = await Match.findOne({
    competition: 'la_liga',
    season: deal.season,
    matchday: deal.matchday,
  }).sort({ startTime: -1 });

  if (lastMatch && new Date() >= new Date(lastMatch.startTime)) {
    throw new AppError('La jornada ya ha terminado, no puedes desbloquear la carta', 409);
  }

  deal.status = 'pending';
  deal.unlockedAt = new Date();
  await deal.save();

  res.json({ deal });
}

export async function redealAll(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, matchday } = req.body as { season: string; matchday: number };
  if (!season || !matchday) throw new AppError('season y matchday son obligatorios', 400);

  await requireGroupAdmin(groupId, req.user!.id);

  const config = await CardConfig.findOne({ group: groupId, season });
  if (!config || config.enabledCards.length === 0) throw new AppError('No hay cartas habilitadas', 400);

  const enabledCards = config.enabledCards as CardKey[];

  const deals = await CardDeal.find({ group: groupId, season, matchday, status: { $in: ['locked', 'pending'] } });
  for (const deal of deals) {
    deal.card = pickRandom(enabledCards);
    await deal.save();
  }

  res.json({ redealt: deals.length });
}
