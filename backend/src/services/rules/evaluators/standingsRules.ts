import { RuleEvaluator, StandingsRuleContext } from '../types';

export const standingsPosition: RuleEvaluator<StandingsRuleContext> = (ctx) => {
  let correctPositions = 0;

  for (const predicted of ctx.predictedTable) {
    const real = ctx.realTable.find((entry) => entry.team === predicted.team);
    if (real && real.position === predicted.position) {
      correctPositions += 1;
    }
  }

  return correctPositions;
};
