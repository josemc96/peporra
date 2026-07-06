import { Router } from 'express';
import * as matchController from '../controllers/match.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, matchController.listMatches);

export default router;
