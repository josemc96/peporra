import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ManualAdjustment } from '../models/ManualAdjustment';
import { AppError } from '../utils/AppError';
import { requireGroupMember, requireGroupAdmin } from '../services/groupAuth.service';

export async function listAdjustments(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  await requireGroupMember(groupId, req.user!.id);

  const adjustments = await ManualAdjustment.find({ group: groupId, season })
    .populate('user', 'alias email')
    .sort({ createdAt: -1 });

  res.json({ adjustments });
}

export async function createAdjustment(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, userId, points, moneyAmount, reason } = req.body as {
    season: string;
    userId: string;
    points?: number;
    moneyAmount?: number;
    reason?: string;
  };

  if (!season || !userId) throw new AppError('season y userId son obligatorios', 400);

  const pts = points ?? 0;
  const money = moneyAmount ?? 0;

  if (!Number.isInteger(pts)) throw new AppError('points debe ser un entero', 400);
  if (typeof money !== 'number') throw new AppError('moneyAmount debe ser un número', 400);
  if (pts === 0 && money === 0) throw new AppError('Indica al menos un ajuste de puntos o de euros', 400);

  const group = await requireGroupAdmin(groupId, req.user!.id);

  const isMember = group.members.some((m) => m.toString() === userId);
  if (!isMember) throw new AppError('El usuario no es miembro de esta peña', 400);

  const adjustment = await ManualAdjustment.create({
    group: new Types.ObjectId(groupId),
    season,
    user: new Types.ObjectId(userId),
    points: pts,
    moneyAmount: money,
    reason,
  });

  await adjustment.populate('user', 'alias email');
  res.status(201).json({ adjustment });
}

export async function deleteAdjustment(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { id } = req.params;

  await requireGroupAdmin(groupId, req.user!.id);

  const adjustment = await ManualAdjustment.findOne({ _id: id, group: groupId });
  if (!adjustment) throw new AppError('Ajuste no encontrado', 404);

  await adjustment.deleteOne();
  res.json({ message: 'Ajuste eliminado' });
}
