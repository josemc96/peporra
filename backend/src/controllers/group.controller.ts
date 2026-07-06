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
