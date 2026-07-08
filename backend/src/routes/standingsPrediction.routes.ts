import { Router } from 'express';
import * as standingsController from '../controllers/standingsPrediction.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.put('/', standingsController.upsertStandingsPrediction);
router.get('/', standingsController.listMyStandingsPredictions);
router.get('/:season/:phase', standingsController.getStandingsPrediction);

export default router;
