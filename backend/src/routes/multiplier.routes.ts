import { Router } from 'express';
import * as controller from '../controllers/multiplier.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.post('/', controller.createMultiplier);
router.get('/', controller.listMultipliers);
router.delete('/:id', controller.deleteMultiplier);

export default router;
