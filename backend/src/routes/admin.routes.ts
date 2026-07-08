import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import * as awardResultController from '../controllers/awardResult.controller';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth, requireAdmin);

router.post('/sync-matches', adminController.triggerMatchSync);
router.post('/sync-scorers', adminController.triggerScorersSync);
router.put('/award-results', awardResultController.setAwardResult);

export default router;
