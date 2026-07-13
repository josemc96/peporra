import { Router } from 'express';
import * as groupController from '../controllers/group.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/', groupController.createGroup);
router.post('/join', groupController.joinGroup);
router.get('/', groupController.listMyGroups);
router.get('/:id', groupController.getGroup);
router.delete('/:id/members/me', groupController.leaveGroup);
router.delete('/:id/members/:userId', groupController.kickMember);

export default router;
