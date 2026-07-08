import { Request, Response } from 'express';
import { GroupRuleSettings } from '../models/GroupRuleSettings';
import { Rule } from '../models/Rule';
import { AppError } from '../utils/AppError';
import { requireGroupAdmin, requireGroupMember } from '../services/groupAuth.service';

export async function getGroupRuleSettings(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.query as { season?: string };
  if (!season) {
    throw new AppError('season es obligatorio', 400);
  }

  await requireGroupMember(groupId, req.user!.id);

  const settings = await GroupRuleSettings.findOne({ group: groupId, season }).populate('rules.rule');
  if (!settings) {
    throw new AppError('No hay configuración de reglas para esa temporada', 404);
  }

  res.json({ settings });
}

export async function updateGroupRuleSettings(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season, rules, enabledCompetitions } = req.body as {
    season?: string;
    rules?: { key?: string; points?: number; active?: boolean }[];
    enabledCompetitions?: string[];
  };

  if (!season) {
    throw new AppError('season es obligatorio', 400);
  }

  await requireGroupAdmin(groupId, req.user!.id);

  const settings = await GroupRuleSettings.findOne({ group: groupId, season });
  if (!settings) {
    throw new AppError('No hay configuración de reglas para esa temporada', 404);
  }

  if (rules) {
    const allRules = await Rule.find();
    const ruleIdByKey = new Map(allRules.map((rule) => [rule.key, rule._id.toString()]));

    for (const update of rules) {
      if (!update.key) continue;

      const ruleId = ruleIdByKey.get(update.key);
      if (!ruleId) {
        throw new AppError(`Regla desconocida: ${update.key}`, 400);
      }

      const entry = settings.rules.find((r) => r.rule.toString() === ruleId);
      if (!entry) {
        throw new AppError(`La peña no tiene configurada la regla: ${update.key}`, 404);
      }

      if (update.points !== undefined) {
        if (!Number.isInteger(update.points) || update.points < 0) {
          throw new AppError('points debe ser un entero no negativo', 400);
        }
        entry.points = update.points;
      }
      if (update.active !== undefined) {
        entry.active = update.active;
      }
    }
  }

  if (enabledCompetitions) {
    const valid = enabledCompetitions.every((c) => c === 'copa_del_rey' || c === 'supercopa');
    if (!valid) {
      throw new AppError('enabledCompetitions solo admite "copa_del_rey"/"supercopa"', 400);
    }
    settings.enabledCompetitions = enabledCompetitions as typeof settings.enabledCompetitions;
  }

  await settings.save();
  res.json({ settings });
}
