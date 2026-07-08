import { Router } from 'express';
import * as matchController from '../controllers/match.controller';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, matchController.listMatches);

// Alta y gestión manual de partidos de Copa del Rey/Supercopa — solo admin.
router.post('/', requireAuth, requireAdmin, matchController.createManualMatch);
router.put('/:id/result', requireAuth, requireAdmin, matchController.setMatchResult);
router.put('/:id/qualifier', requireAuth, requireAdmin, matchController.setMatchQualifier);

export default router;
