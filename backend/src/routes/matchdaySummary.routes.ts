import { Router } from 'express';
import * as controller from '../controllers/matchdaySummary.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.get('/:userId', requireAuth, controller.getMatchdaySummary);

export default router;
