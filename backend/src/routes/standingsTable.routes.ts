import { Router } from 'express';
import * as controller from '../controllers/standingsTable.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, controller.getCurrentStandingsTable);

export default router;
