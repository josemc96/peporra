import { scoreMatchPredictions } from './scoreMatchPredictions.job';
import { scoreQualifierPredictions } from './scoreQualifierPredictions.job';
import { scoreStandingsPredictions } from './scoreStandingsPredictions.job';
import { scoreAwardPredictions } from './scoreAwardPredictions.job';

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

  return {
    matchPredictionsScored: matches.predictionsScored,
    qualifierPredictionsScored: qualifiers.predictionsScored,
    standingsPredictionsScored: standings.predictionsScored,
    awardPredictionsScored: awards.predictionsScored,
  };
}
