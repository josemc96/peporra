import { Types } from 'mongoose';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import { Group } from '../models/Group';
import { Rule } from '../models/Rule';
import { CardDeal } from '../models/CardDeal';
import { CardPlay } from '../models/CardPlay';
import { CardKey } from '../types/enums';
import { ruleEvaluators } from '../services/rules/registry';
import { resolveActiveRules } from '../services/rules/resolveActiveRules';
import { resolveMultiplier } from '../services/rules/resolveMultiplier';
import { isCompetitionEnabledForGroup } from '../services/competitionEligibility.service';

function varCoversResult(pH: number, pA: number, rH: number, rA: number): boolean {
  if (pH === rH && pA === rA) return false; // already exact, VAR not needed
  if (Math.abs(pH - rH) === 1 && pA === rA) return true;
  if (pH === rH && Math.abs(pA - rA) === 1) return true;
  return false;
}

// Comodín: el resultado predicho AL REVÉS también cuenta como exacto (2-1 vale también
// como si hubieras puesto 1-2). Si ya era exacto de por sí, no hace falta el comodín.
function comodinCoversResult(pH: number, pA: number, rH: number, rA: number): boolean {
  if (pH === rH && pA === rA) return false; // already exact, comodín not needed
  return pH === rA && pA === rH;
}

async function hasCardPlay(
  card: CardKey,
  userId: Types.ObjectId, groupId: Types.ObjectId, season: string, matchday: number | undefined, matchId: Types.ObjectId
): Promise<boolean> {
  if (matchday == null) return false;
  const deal = await CardDeal.findOne({ user: userId, group: groupId, season, matchday, card, status: 'played' });
  if (!deal) return false;
  const play = await CardPlay.findOne({ deal: deal._id, targetMatch: matchId });
  return !!play;
}

// El Borracho: invierte la predicción de la víctima en ese partido (2-1 pasa a 1-2), salvo
// que tenga El Espejo puesto ahí — entonces no le afecta y el golpe recae sobre el propio
// atacante, en SU predicción de ese mismo partido (si la tiene) — o que tenga El Autobús,
// que simplemente le hace inmune (sin reflejar el golpe a nadie).
async function borrachoSwapActive(
  userId: Types.ObjectId, groupId: Types.ObjectId, season: string, matchday: number | undefined, matchId: Types.ObjectId
): Promise<boolean> {
  if (matchday == null) return false;

  // ¿Me emborracharon a mí en este partido?
  const borrachoDeals = await CardDeal.find({ group: groupId, season, matchday, card: 'borracho', status: 'played' })
    .select('_id user');
  if (borrachoDeals.length > 0) {
    const dealIds = borrachoDeals.map((d) => d._id);
    const attackPlay = await CardPlay.findOne({ deal: { $in: dealIds }, targetUser: userId, targetMatch: matchId });
    if (attackPlay) {
      const protectedByEspejo = await hasCardPlay('espejo', userId, groupId, season, matchday, matchId);
      const protectedByAutobus = await hasCardPlay('el_autobus', userId, groupId, season, matchday, matchId);
      // Si tengo Espejo, el golpe no me afecta a mí — se resuelve más abajo, cuando se
      // puntúe la predicción del propio atacante. Si tengo Autobús, simplemente no me afecta.
      return !protectedByEspejo && !protectedByAutobus;
    }
  }

  // Si no me atacaron a mí, ¿soy yo el atacante y mi golpe fue reflejado por el Espejo
  // de mi objetivo?
  const myDeal = await CardDeal.findOne({ user: userId, group: groupId, season, matchday, card: 'borracho', status: 'played' });
  if (!myDeal) return false;
  const myPlay = await CardPlay.findOne({ deal: myDeal._id, targetMatch: matchId });
  if (!myPlay || !myPlay.targetUser) return false;
  return hasCardPlay('espejo', myPlay.targetUser as Types.ObjectId, groupId, season, matchday, matchId);
}

export interface ScoreMatchPredictionsResult {
  predictionsScored: number;
  predictionsFailed: number;
}

export async function scoreMatchPredictions(): Promise<ScoreMatchPredictionsResult> {
  const finishedMatches = await Match.find({ status: 'finished' });
  const finishedMatchIds = finishedMatches.map((m) => m._id);
  const matchById = new Map(finishedMatches.map((m) => [m._id.toString(), m]));

  const pendingPredictions = await Prediction.find({ match: { $in: finishedMatchIds }, status: 'pending' });

  const allRules = await Rule.find();
  const ruleIdByKey = new Map(allRules.map((rule) => [rule.key, rule._id as Types.ObjectId]));

  let predictionsScored = 0;
  let predictionsFailed = 0;

  for (const prediction of pendingPredictions) {
    // Aislada por predicción: un registro corrupto (ej. datos de prueba antiguos sin
    // `group`) no puede volver a tumbar la puntuación de todos los demás detrás de él.
    try {
      const match = matchById.get(prediction.match.toString())!;

      const group = prediction.group ? await Group.findById(prediction.group) : null;
      if (!group) {
        prediction.status = 'scored';
        await prediction.save({ validateBeforeSave: false });
        continue;
      }

      const eligible = await isCompetitionEnabledForGroup(group._id as Types.ObjectId, match.season, match.competition);
      if (!eligible) {
        prediction.status = 'scored';
        await prediction.save();
        predictionsScored += 1;
        continue;
      }

      const activeRules = await resolveActiveRules(group._id as Types.ObjectId, match.season, 'match');

      const varActive = await hasCardPlay(
        'el_var', prediction.user as Types.ObjectId, group._id as Types.ObjectId,
        match.season, match.matchday, match._id as Types.ObjectId,
      );
      const comodinActive = await hasCardPlay(
        'comodin', prediction.user as Types.ObjectId, group._id as Types.ObjectId,
        match.season, match.matchday, match._id as Types.ObjectId,
      );
      const borrachoSwap = await borrachoSwapActive(
        prediction.user as Types.ObjectId, group._id as Types.ObjectId,
        match.season, match.matchday, match._id as Types.ObjectId,
      );

      const pH = prediction.predictedHome;
      const pA = prediction.predictedAway;
      const rH = match.homeScore!;
      const rA = match.awayScore!;

      // El Borracho invierte la predicción base (salvo Espejo de por medio, ver arriba);
      // VAR y Comodín se evalúan ya sobre ese resultado base, no sobre el original.
      const baseHome = borrachoSwap ? pA : pH;
      const baseAway = borrachoSwap ? pH : pA;

      // VAR: si fallas por 1 gol en un lado (y aciertas el otro), cuenta como exacto.
      // Comodín: si el resultado al revés coincide con el real, también cuenta como exacto.
      // Un usuario solo puede tener una carta por jornada, así que nunca coinciden los dos.
      let effectiveHome = baseHome;
      let effectiveAway = baseAway;
      if (varActive && varCoversResult(baseHome, baseAway, rH, rA)) {
        effectiveHome = rH;
        effectiveAway = rA;
      } else if (comodinActive && comodinCoversResult(baseHome, baseAway, rH, rA)) {
        effectiveHome = rH;
        effectiveAway = rA;
      }

      let totalPoints = 0;
      const ruleBreakdown: { rule: Types.ObjectId; points: number }[] = [];

      for (const active of activeRules) {
        const evaluator = ruleEvaluators[active.key];
        const occurrences = evaluator({
          predictedHome: effectiveHome,
          predictedAway: effectiveAway,
          realHome: rH,
          realAway: rA,
        } as never);

        if (occurrences > 0) {
          const rulePoints = occurrences * active.points;
          totalPoints += rulePoints;
          const ruleId = ruleIdByKey.get(active.key);
          if (ruleId) ruleBreakdown.push({ rule: ruleId, points: rulePoints });
        }
      }

      const multiplier = await resolveMultiplier(group._id as Types.ObjectId, match._id as Types.ObjectId, match.matchday);
      const finalPoints = totalPoints * multiplier;

      await PredictionScore.findOneAndUpdate(
        { prediction: prediction._id, group: group._id },
        {
          $set: {
            prediction: prediction._id,
            group: group._id,
            points: finalPoints,
            preCardPoints: finalPoints,
            ruleBreakdown,
            multiplierApplied: multiplier > 1 ? multiplier : undefined,
          },
        },
        { upsert: true }
      );

      prediction.status = 'scored';
      await prediction.save();
      predictionsScored += 1;
    } catch (err) {
      predictionsFailed += 1;
      console.error(`Error puntuando prediction ${prediction._id.toString()}:`, err);
    }
  }

  return { predictionsScored, predictionsFailed };
}
