import { Router } from 'express';
import * as scorerController from '../controllers/scorer.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, scorerController.listScorers);

export default router;
