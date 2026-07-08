import { Router } from 'express';
import * as awardController from '../controllers/awardPrediction.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.put('/', awardController.upsertAwardPrediction);
router.get('/', awardController.listMyAwardPredictions);
router.get('/:season/:award', awardController.getAwardPrediction);

export default router;
