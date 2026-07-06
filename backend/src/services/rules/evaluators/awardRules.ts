import { AwardRuleContext, RuleEvaluator } from '../types';

function isSamePlayer(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const pichichiCorrect: RuleEvaluator<AwardRuleContext> = (ctx) => {
  return isSamePlayer(ctx.predictedPlayer, ctx.realPlayer) ? 1 : 0;
};

export const zamoraCorrect: RuleEvaluator<AwardRuleContext> = (ctx) => {
  return isSamePlayer(ctx.predictedPlayer, ctx.realPlayer) ? 1 : 0;
};
