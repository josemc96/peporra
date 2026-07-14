import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getCardConfig, updateCardConfig,
  getMyDeal, getAllDeals, triggerDeal,
  redealUser, redealAll,
} from '../controllers/card.controller';
import { playCard, spyMatch, getActiveCardPlays } from '../controllers/cardPlay.controller';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Config
router.get('/config',  getCardConfig);
router.put('/config',  updateCardConfig);

// Deals
router.get('/deal',    getMyDeal);
router.get('/deals',   getAllDeals);
router.post('/deal',   triggerDeal);

// Redeal
router.post('/redeal',     redealUser);
router.post('/redeal-all', redealAll);

// Play
router.post('/play',           playCard);
router.get('/spy/:matchId',    spyMatch);
router.get('/active',          getActiveCardPlays);

export default router;
