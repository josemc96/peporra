import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import groupRoutes from './routes/group.routes';
import adminRoutes from './routes/admin.routes';
import matchRoutes from './routes/match.routes';
import predictionRoutes from './routes/prediction.routes';
import standingsPredictionRoutes from './routes/standingsPrediction.routes';
import awardPredictionRoutes from './routes/awardPrediction.routes';
import scorerRoutes from './routes/scorer.routes';
import qualifierPredictionRoutes from './routes/qualifierPrediction.routes';
import groupRuleSettingsRoutes from './routes/groupRuleSettings.routes';
import multiplierRoutes from './routes/multiplier.routes';
import awardResultRoutes from './routes/awardResult.routes';
import rankingRoutes from './routes/ranking.routes';
import penaltyRoutes from './routes/penaltyConfig.routes';
import manualAdjustmentRoutes from './routes/manualAdjustment.routes';
import cardRoutes from './routes/card.routes';
import { getMatchPredictionVisibility } from './controllers/matchPredictionVisibility.controller';
import { requireAuth } from './middleware/auth.middleware';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/standings-predictions', standingsPredictionRoutes);
app.use('/api/award-predictions', awardPredictionRoutes);
app.use('/api/scorers', scorerRoutes);
app.use('/api/qualifier-predictions', qualifierPredictionRoutes);
app.use('/api/groups/:groupId/rule-settings', groupRuleSettingsRoutes);
app.use('/api/groups/:groupId/multipliers', multiplierRoutes);
app.use('/api/award-results', awardResultRoutes);
app.use('/api/groups/:groupId/ranking', rankingRoutes);
app.use('/api/groups/:groupId/penalties', penaltyRoutes);
app.use('/api/groups/:groupId/adjustments', manualAdjustmentRoutes);
app.use('/api/groups/:groupId/cards', cardRoutes);
app.get('/api/groups/:groupId/matches/:matchId/predictions', requireAuth, getMatchPredictionVisibility);

app.use(errorHandler);

export default app;
