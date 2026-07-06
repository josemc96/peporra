export interface MatchRuleContext {
  predictedHome: number;
  predictedAway: number;
  realHome: number;
  realAway: number;
}

export interface StandingsRuleContext {
  predictedTable: { position: number; team: string }[];
  realTable: { position: number; team: string }[];
}

export interface AwardRuleContext {
  predictedPlayer: string;
  realPlayer: string;
}

export interface KnockoutRuleContext {
  wasDrawAt90: boolean;
  predictedQualifier: 'home' | 'away';
  realQualifier: 'home' | 'away';
}

/**
 * Devuelve el número de veces que se cumple la condición de la regla
 * (normalmente 0 o 1; en standings_position puede ser >1, una por posición acertada).
 * Los puntos finales = occurrences * rule.points (configurado en GroupRuleSettings).
 */
export type RuleEvaluator<TContext> = (context: TContext) => number;
