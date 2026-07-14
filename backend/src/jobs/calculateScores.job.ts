import { scoreMatchPredictions } from './scoreMatchPredictions.job';
import { scoreQualifierPredictions } from './scoreQualifierPredictions.job';
import { scoreStandingsPredictions } from './scoreStandingsPredictions.job';
import { scoreAwardPredictions } from './scoreAwardPredictions.job';
import { applyMatchdayPenalties } from './applyMatchdayPenalties.job';
import { applyCardEffects } from './applyCardEffects.job';

export interface CalculateScoresResult {
  matchPredictionsScored: number;
  qualifierPredictionsScored: number;
  standingsPredictionsScored: number;
  awardPredictionsScored: number;
}

export async function calculateScores(season: string): Promise<CalculateScoresResult> {
  const [matches, qualifiers, standings, awards] = await Promise.all([
    scoreMatchPredictions(),
    scoreQualifierPredictions(),
    scoreStandingsPredictions(season),
    scoreAwardPredictions(season),
  ]);

  // Aplicar efectos de cartas sobre los PredictionScore ya calculados
  await applyCardEffects(season);

  // Después de puntuar y aplicar cartas, aplicar penalizaciones de jornada
  await applyMatchdayPenalties();

  return {
    matchPredictionsScored: matches.predictionsScored,
    qualifierPredictionsScored: qualifiers.predictionsScored,
    standingsPredictionsScored: standings.predictionsScored,
    awardPredictionsScored: awards.predictionsScored,
  };
}
