import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getCardConfig, updateCardConfig,
  getMyDeal, getAllDeals, triggerDeal,
  redealUser, redealAll, resetDeal, unlockCard,
  recalculateCardEffects, getPressConferenceReveals,
} from '../controllers/card.controller';
import {
  playCard, getActiveCardPlays, getMySpyResults, revealMimic,
  respondToReto, getPendingRetos,
} from '../controllers/cardPlay.controller';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Config
router.get('/config',  getCardConfig);
router.put('/config',  updateCardConfig);

// Deals
router.get('/deal',    getMyDeal);
router.get('/deals',   getAllDeals);
router.post('/deal',   triggerDeal);

// Redeal / reset
router.post('/redeal',       redealUser);
router.post('/redeal-all',   redealAll);
router.post('/reset',        resetDeal);
router.post('/recalculate',  recalculateCardEffects);

// Unlock
router.post('/unlock',         unlockCard);

// Mimo: elegir a ciegas a quién copiar
router.post('/mimic',          revealMimic);

// Reto: el rival responde al desafío
router.post('/reto/respond',   respondToReto);
router.get('/reto/pending',    getPendingRetos);

// Play
router.post('/play',           playCard);
router.get('/active',          getActiveCardPlays);
router.get('/press-reveals',   getPressConferenceReveals);
router.get('/spy-results',     getMySpyResults);

export default router;
