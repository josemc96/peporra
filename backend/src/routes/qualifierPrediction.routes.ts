import { Router } from 'express';
import * as qualifierController from '../controllers/qualifierPrediction.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.put('/', qualifierController.upsertQualifierPrediction);
router.get('/', qualifierController.listMyQualifierPredictions);
router.get('/:matchId', qualifierController.getQualifierPrediction);

export default router;
