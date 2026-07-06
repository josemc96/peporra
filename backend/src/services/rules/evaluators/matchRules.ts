import { MatchRuleContext, RuleEvaluator } from '../types';

function isExactScore(ctx: MatchRuleContext): boolean {
  return ctx.predictedHome === ctx.realHome && ctx.predictedAway === ctx.realAway;
}

export const exactScore: RuleEvaluator<MatchRuleContext> = (ctx) => {
  return isExactScore(ctx) ? 1 : 0;
};

// Si el resultado fue exacto, ya lo puntúa 'exact_score' — evita sumar también el punto
// de signo cuando ambas reglas están activas a la vez (3+1 no debe convertirse en 4).
export const correctSign: RuleEvaluator<MatchRuleContext> = (ctx) => {
  if (isExactScore(ctx)) return 0;

  const predictedSign = Math.sign(ctx.predictedHome - ctx.predictedAway);
  const realSign = Math.sign(ctx.realHome - ctx.realAway);
  return predictedSign === realSign ? 1 : 0;
};
