import { Router } from 'express';
import * as controller from '../controllers/ranking.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, controller.getGroupRanking);

export default router;
