import { Router } from 'express';
import * as controller from '../controllers/awardResult.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, controller.listAwardResults);

export default router;
