import { Router } from 'express';
import * as predictionController from '../controllers/prediction.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.put('/', predictionController.upsertPrediction);
router.get('/', predictionController.listMyPredictions);
router.get('/:matchId', predictionController.getPredictionForMatch);

export default router;
