import { Request, Response } from 'express';
import { env } from '../config/env';
import { syncLaLigaMatches } from '../jobs/syncMatches.job';
import { syncTopScorers } from '../jobs/syncScorers.job';
import { calculateScores } from '../jobs/calculateScores.job';
import { User } from '../models/User';
import { AwardPrediction } from '../models/AwardPrediction';
import { AppError } from '../utils/AppError';

export async function triggerMatchSync(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await syncLaLigaMatches(season ?? env.currentSeason);
  res.json(result);
}

export async function triggerScorersSync(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await syncTopScorers(season ?? env.currentSeason);
  res.json(result);
}

export async function triggerCalculateScores(req: Request, res: Response): Promise<void> {
  const { season } = req.body as { season?: string };
  const result = await calculateScores(season ?? env.currentSeason);
  res.json(result);
}

export async function setUserAwardPrediction(req: Request, res: Response): Promise<void> {
  const { userEmail, season, award, predictedPlayer } = req.body as {
    userEmail?: string;
    season?: string;
    award?: string;
    predictedPlayer?: string;
  };

  if (!userEmail || !season || (award !== 'pichichi' && award !== 'zamora')) {
    throw new AppError('userEmail, season y award ("pichichi"/"zamora") son obligatorios', 400);
  }
  if (typeof predictedPlayer !== 'string' || predictedPlayer.trim().length === 0) {
    throw new AppError('predictedPlayer es obligatorio', 400);
  }

  const user = await User.findOne({ email: userEmail.trim().toLowerCase() });
  if (!user) throw new AppError(`No existe usuario con email ${userEmail}`, 404);

  const prediction = await AwardPrediction.findOneAndUpdate(
    { user: user._id, season, award },
    { user: user._id, season, award, predictedPlayer: predictedPlayer.trim(), status: 'pending' },
    { upsert: true, new: true }
  );

  res.json({ prediction, userAlias: user.alias });
}
