import { Types } from 'mongoose';
import { GroupRuleSettings } from '../../models/GroupRuleSettings';
import { IRule } from '../../models/Rule';
import { RuleScope } from '../../types/enums';
import { RuleKey } from './registry';

export interface ActiveRule {
  key: RuleKey;
  points: number;
}

export async function resolveActiveRules(
  group: Types.ObjectId,
  season: string,
  scope: RuleScope
): Promise<ActiveRule[]> {
  const settings = await GroupRuleSettings.findOne({ group, season }).populate<{
    rules: { rule: IRule; points: number; active: boolean }[];
  }>('rules.rule');

  if (!settings) return [];

  return settings.rules
    .filter((config) => config.active && config.rule.scope === scope)
    .map((config) => ({
      key: config.rule.key as RuleKey,
      points: config.points,
    }));
}
