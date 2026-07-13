import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listAdjustments, createAdjustment, deleteAdjustment } from '../controllers/manualAdjustment.controller';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/',     listAdjustments);
router.post('/',    createAdjustment);
router.delete('/:id', deleteAdjustment);

export default router;
