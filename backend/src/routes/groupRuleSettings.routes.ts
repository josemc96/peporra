import { Router } from 'express';
import * as controller from '../controllers/groupRuleSettings.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', controller.getGroupRuleSettings);
router.put('/', controller.updateGroupRuleSettings);

export default router;
