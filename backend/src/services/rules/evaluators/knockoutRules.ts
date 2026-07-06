import { KnockoutRuleContext, RuleEvaluator } from '../types';

// Solo cuenta si el partido acabó empatado a los 90' (sin prórroga ni penaltis).
// Si no hubo empate, la predicción no se puntúa ni penaliza: se ignora.
export const knockoutQualifier: RuleEvaluator<KnockoutRuleContext> = (ctx) => {
  if (!ctx.wasDrawAt90) return 0;
  return ctx.predictedQualifier === ctx.realQualifier ? 1 : 0;
};
