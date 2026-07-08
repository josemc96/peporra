import { Group, IGroup } from '../models/Group';
import { AppError } from '../utils/AppError';

export async function requireGroupMember(groupId: string, userId: string): Promise<IGroup> {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new AppError('Peña no encontrada', 404);
  }
  const isMember = group.members.some((memberId) => memberId.toString() === userId);
  if (!isMember) {
    throw new AppError('No perteneces a esta peña', 403);
  }
  return group;
}

export async function requireGroupAdmin(groupId: string, userId: string): Promise<IGroup> {
  const group = await requireGroupMember(groupId, userId);
  if (group.admin.toString() !== userId) {
    throw new AppError('Solo el admin de la peña puede hacer esto', 403);
  }
  return group;
}
