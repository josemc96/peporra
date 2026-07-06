import { exactScore, correctSign } from './evaluators/matchRules';
import { standingsPosition } from './evaluators/standingsRules';
import { pichichiCorrect, zamoraCorrect } from './evaluators/awardRules';
import { knockoutQualifier } from './evaluators/knockoutRules';

export const ruleEvaluators = {
  exact_score: exactScore,
  correct_sign: correctSign,
  standings_position: standingsPosition,
  pichichi_correct: pichichiCorrect,
  zamora_correct: zamoraCorrect,
  knockout_qualifier: knockoutQualifier,
} as const;

export type RuleKey = keyof typeof ruleEvaluators;
