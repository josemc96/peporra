import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { Group } from '../models/Group';
import { GroupRuleSettings } from '../models/GroupRuleSettings';
import { Rule } from '../models/Rule';
import { IUser } from '../models/User';
import { AppError } from '../utils/AppError';

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = nanoid(8);
    const existing = await Group.findOne({ inviteCode: code });
    if (!existing) return code;
  }
  throw new AppError('No se pudo generar un código de invitación único, inténtalo de nuevo', 500);
}

export async function createGroup(req: Request, res: Response): Promise<void> {
  const { name, season } = req.body as { name?: string; season?: string };

  if (!name || !season) {
    throw new AppError('name y season son obligatorios', 400);
  }

  const inviteCode = await generateUniqueInviteCode();

  const group = await Group.create({
    name,
    season,
    inviteCode,
    admin: req.user!.id,
    members: [req.user!.id],
  });

  const rules = await Rule.find();
  await GroupRuleSettings.create({
    group: group._id,
    season,
    rules: rules.map((rule) => ({ rule: rule._id, points: rule.defaultPoints, active: false })),
  });

  res.status(201).json({ group });
}

export async function joinGroup(req: Request, res: Response): Promise<void> {
  const { inviteCode } = req.body as { inviteCode?: string };
  if (!inviteCode) {
    throw new AppError('inviteCode es obligatorio', 400);
  }

  const group = await Group.findOne({ inviteCode });
  if (!group) {
    throw new AppError('Código de invitación no válido', 404);
  }

  const userId = req.user!.id;
  if (group.members.some((memberId) => memberId.toString() === userId)) {
    throw new AppError('Ya eres miembro de esta peña', 409);
  }

  const updatedGroup = await Group.findByIdAndUpdate(
    group._id,
    { $addToSet: { members: userId } },
    { new: true }
  );

  res.json({ group: updatedGroup });
}

export async function listMyGroups(req: Request, res: Response): Promise<void> {
  const groups = await Group.find({ members: req.user!.id });
  res.json({ groups });
}

export async function leaveGroup(req: Request, res: Response): Promise<void> {
  const group = await Group.findById(req.params.id);
  if (!group) throw new AppError('Peña no encontrada', 404);

  const userId = req.user!.id;
  if (!group.members.some((m) => m.toString() === userId)) {
    throw new AppError('No perteneces a esta peña', 403);
  }
  if (group.admin.toString() === userId) {
    throw new AppError('El admin no puede abandonar la peña', 400);
  }

  await Group.findByIdAndUpdate(group._id, { $pull: { members: userId } });
  res.json({ message: 'Has abandonado la peña' });
}

export async function kickMember(req: Request, res: Response): Promise<void> {
  const group = await Group.findById(req.params.id);
  if (!group) throw new AppError('Peña no encontrada', 404);

  const requesterId = req.user!.id;
  if (group.admin.toString() !== requesterId) {
    throw new AppError('Solo el admin puede expulsar miembros', 403);
  }

  const targetId = req.params.userId;
  if (targetId === requesterId) {
    throw new AppError('El admin no puede expulsarse a sí mismo', 400);
  }
  if (!group.members.some((m) => m.toString() === targetId)) {
    throw new AppError('Ese usuario no es miembro de la peña', 404);
  }

  await Group.findByIdAndUpdate(group._id, { $pull: { members: targetId } });
  res.json({ message: 'Miembro expulsado' });
}

export async function getGroup(req: Request, res: Response): Promise<void> {
  const group = await Group.findById(req.params.id).populate<{ admin: IUser; members: IUser[] }>(
    'admin members',
    'email alias'
  );
  if (!group) {
    throw new AppError('Peña no encontrada', 404);
  }

  const userId = req.user!.id;
  const isMember = group.members.some((member) => member._id!.toString() === userId);
  if (!isMember) {
    throw new AppError('No perteneces a esta peña', 403);
  }

  res.json({ group });
}
