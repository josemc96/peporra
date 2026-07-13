import { Router } from 'express';
import * as controller from '../controllers/penaltyConfig.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/config', controller.getPenaltyConfig);
router.put('/config', controller.updatePenaltyConfig);
router.post('/config/recalculate', controller.recalculatePenalties);
router.get('/matchday', controller.getMatchdayRanking);
router.get('/debt', controller.getGroupDebt);

export default router;
