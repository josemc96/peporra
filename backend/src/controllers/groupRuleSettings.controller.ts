import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { GroupRuleSettings } from '../models/GroupRuleSettings';
import { Group } from '../models/Group';
import { Rule } from '../models/Rule';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { QualifierPrediction } from '../models/QualifierPrediction';
import { StandingsPrediction } from '../models/StandingsPrediction';
import { StandingsPredictionScore } from '../models/StandingsPredictionScore';
import { AwardPrediction } from '../models/AwardPrediction';
import { AwardPredictionScore } from '../models/AwardPredictionScore';
import { AppError } from '../utils/AppError';
import { requireGroupAdmin, requireGroupMember } from '../services/groupAuth.service';
import { scoreMatchPredictions } from '../jobs/scoreMatchPredictions.job';
import { scoreQualifierPredictions } from '../jobs/scoreQualifierPredictions.job';
import { scoreStandingsPredictions } from '../jobs/scoreStandingsPredictions.job';
import { scoreAwardPredictions } from '../jobs/scoreAwardPredictions.job';
import { applyCardEffects } from '../jobs/applyCardEffects.job';

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
  const { season, rules, enabledCompetitions, enabledFeatures } = req.body as {
    season?: string;
    rules?: { key?: string; points?: number; active?: boolean }[];
    enabledCompetitions?: string[];
    enabledFeatures?: string[];
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

  if (enabledFeatures) {
    const validFeatures = ['standings', 'pichichi', 'zamora'];
    const valid = enabledFeatures.every((f) => validFeatures.includes(f));
    if (!valid) {
      throw new AppError('enabledFeatures solo admite "standings"/"pichichi"/"zamora"', 400);
    }
    settings.enabledFeatures = enabledFeatures as typeof settings.enabledFeatures;
  }

  await settings.save();
  res.json({ settings });
}

export async function recalculateGroupScores(req: Request, res: Response): Promise<void> {
  const groupId = req.params.groupId as string;
  const { season } = req.body as { season?: string };
  if (!season) throw new AppError('season es obligatorio', 400);

  const group = await requireGroupAdmin(groupId, req.user!.id);
  const memberIds = group.members.map((m) => m.toString());

  // Reset match & qualifier predictions for this group
  const finishedMatchIds = (await Match.find({ season, status: 'finished' }).select('_id')).map((m) => m._id);

  await Prediction.updateMany(
    { group: new Types.ObjectId(groupId), match: { $in: finishedMatchIds } },
    { $set: { status: 'pending' } }
  );

  await QualifierPrediction.updateMany(
    { group: new Types.ObjectId(groupId), match: { $in: finishedMatchIds } },
    { $set: { status: 'pending' } }
  );

  // Reset standings & award predictions for this group's members
  // (these don't have a group field — scores do, so delete scores and reset status)
  const standingsPredIds = (await StandingsPrediction.find({ user: { $in: memberIds }, season }).select('_id')).map((p) => p._id);
  if (standingsPredIds.length) {
    await StandingsPredictionScore.deleteMany({ group: new Types.ObjectId(groupId), standingsPrediction: { $in: standingsPredIds } });
    await StandingsPrediction.updateMany({ _id: { $in: standingsPredIds } }, { $set: { status: 'pending' } });
  }

  const awardPredIds = (await AwardPrediction.find({ user: { $in: memberIds }, season }).select('_id')).map((p) => p._id);
  if (awardPredIds.length) {
    await AwardPredictionScore.deleteMany({ group: new Types.ObjectId(groupId), awardPrediction: { $in: awardPredIds } });
    await AwardPrediction.updateMany({ _id: { $in: awardPredIds } }, { $set: { status: 'pending' } });
  }

  // Re-run all scoring jobs (sequentially so card effects see final base scores)
  const matchRes = await scoreMatchPredictions();
  const qualRes = await scoreQualifierPredictions();
  const standingsRes = await scoreStandingsPredictions(season);
  const awardRes = await scoreAwardPredictions(season);

  // Re-apply card effects on top of the recalculated base scores
  await applyCardEffects(season);

  res.json({
    ok: true,
    scored: {
      predictions: matchRes.predictionsScored,
      qualifiers: qualRes.predictionsScored,
      standings: standingsRes.predictionsScored,
      awards: awardRes.predictionsScored,
    },
  });
}
