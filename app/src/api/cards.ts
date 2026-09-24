import { apiFetch } from './client';

export type CardKey =
  | 'la_mina' | 'la_roja' | 'la_lesion' | 'el_var' | 'el_autobus'
  | 'el_espia' | 'rueda_prensa' | 'la_aficion' | 'el_doblete' | 'me_la_juego'
  | 'mimo' | 'dupla' | 'espejo' | 'comodin' | 'borracho' | 'reto';

export const ALL_CARD_KEYS: CardKey[] = [
  'la_mina', 'la_roja', 'la_lesion', 'el_var', 'el_autobus',
  'el_espia', 'rueda_prensa', 'la_aficion', 'el_doblete', 'me_la_juego',
  'mimo', 'dupla', 'espejo', 'comodin', 'borracho', 'reto',
];

export const CARD_LABELS: Record<CardKey, string> = {
  la_mina: 'La Mina',
  la_roja: 'La Roja',
  la_lesion: 'La Lesión',
  el_var: 'El VAR',
  el_autobus: 'El Autobús',
  el_espia: 'El Espía',
  rueda_prensa: 'Rueda de Prensa',
  la_aficion: 'La Afición',
  el_doblete: 'El Doblete',
  me_la_juego: 'Me la Juego',
  mimo: 'Mimo',
  dupla: 'Dupla',
  espejo: 'Espejo',
  comodin: 'Comodín',
  borracho: 'El Borracho',
  reto: 'El Reto',
};

export const CARD_EMOJI: Record<CardKey, string> = {
  la_mina: '💣',
  la_roja: '🟥',
  la_lesion: '🩹',
  el_var: '📹',
  el_autobus: '🚌',
  el_espia: '🕵️',
  rueda_prensa: '🎙️',
  la_aficion: '📣',
  el_doblete: '⚡',
  me_la_juego: '🎲',
  mimo: '🎭',
  dupla: '👯',
  espejo: '🪞',
  comodin: '🃏',
  borracho: '🍺',
  reto: '⚔️',
};

export const CARD_DESCRIPTIONS: Record<CardKey, string> = {
  la_mina: 'Si aciertas el resultado, quienes hayan predicho lo mismo puntúan 0.',
  la_roja: 'Un rival pierde sus puntos en un partido.',
  la_lesion: 'Un rival obtiene la mitad de puntos en un partido.',
  el_var: 'Si fallas el resultado exacto por un solo gol en un lado (y el otro lo aciertas), cuenta como resultado exacto.',
  el_autobus: 'Quedas inmune en un partido y tienes mínimo 1 punto.',
  el_espia: 'Consulta la predicción de un rival antes del partido.',
  rueda_prensa: 'Convocas a un rival: su predicción en un partido se hace pública para toda la peña, y si la cambia también se ve.',
  la_aficion: 'Recibes la mitad de puntos de un rival que quede en el podio de jornada.',
  el_doblete: 'Doblas tus puntos base en un partido.',
  me_la_juego: 'Apuesta X puntos en un partido: si aciertas resultado exacto ganas X, si no pierdes X/2.',
  mimo: 'Eliges a un rival a ciegas (sin saber qué carta tiene) y copias su carta.',
  dupla: 'Eliges a 2 jugadores (pueden ser 2 rivales): al acabar la jornada, ambos quedan con la media de sus puntos.',
  espejo: 'En un partido tuyo: si te atacan con La Roja, La Lesión o La Mina, no te afecta y el golpe se devuelve a quien lo usó (si tenía predicción ahí). A diferencia de El Autobús, no garantiza mínimo 1 punto.',
  comodin: 'En un partido tuyo: el resultado que predigas también vale al revés para el resultado exacto (ej. 2-1 también cuenta si el real es 1-2).',
  borracho: 'Emborrachas a un rival en un partido: su predicción se invierte (2-1 pasa a 1-2). Si tiene Autobús puesto ahí, no le afecta. Si tiene Espejo, no le afecta y te invierte a ti la tuya en ese partido.',
  reto: 'Retas a un rival a ver quién queda mejor en la jornada (debe aceptarlo antes de que empiece): si ganas le quitas 4 puntos, si pierdes te los quita él. Si rechaza o no responde a tiempo, pierde 2 puntos sin dártelos a ti.',
};

export type CardDealStatus = 'locked' | 'pending' | 'played' | 'expired';

export interface CardConfig {
  _id: string;
  group: string;
  season: string;
  enabledCards: CardKey[];
  melaJuegoLimit: number;
}

export interface CardDeal {
  _id: string;
  group: string;
  season: string;
  matchday: number;
  user: { _id: string; alias: string; email: string } | string;
  card: CardKey;
  status: CardDealStatus;
  dealtAt: string;
  // Mimo: una vez revelado, `card` ya es el tipo copiado — estos dos campos solo quedan
  // como rastro de que en realidad era Mimo, para mostrarlo en la UI.
  mimicked?: boolean;
  mimicSource?: string;
}

export interface CardPlay {
  _id: string;
  deal: string;
  targetUser?: string;
  targetMatch?: string;
  params: { amount?: number; copiedUserId?: string; secondUserId?: string; retoAccepted?: boolean };
  playedAt: string;
}

export interface ActiveCardPlay {
  _id: string;
  deal: {
    _id: string; card: CardKey; user: { _id: string; alias: string };
    mimicked?: boolean; mimicSource?: { _id: string; alias: string };
  };
  targetUser?: { _id: string; alias: string };
  targetMatch?: { _id: string; homeTeam: string; awayTeam: string; startTime: string; matchday: number };
  params: { amount?: number; copiedUserId?: string; secondUserId?: string; retoAccepted?: boolean };
  playedAt: string;
}

export interface PendingReto {
  playId: string;
  challenger: { _id: string; alias: string };
}

const base = (groupId: string) => `/groups/${groupId}/cards`;
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) });

export const cardsApi = {
  getConfig: (groupId: string, season: string): Promise<{ config: CardConfig | null }> =>
    apiFetch(`${base(groupId)}/config?season=${encodeURIComponent(season)}`),

  updateConfig: (groupId: string, body: { season: string; enabledCards: CardKey[]; melaJuegoLimit?: number }): Promise<{ config: CardConfig }> =>
    apiFetch(`${base(groupId)}/config`, put(body)),

  getMyDeal: (groupId: string, season: string, matchday: number): Promise<{ deal: CardDeal | null; play: CardPlay | null }> =>
    apiFetch(`${base(groupId)}/deal?season=${encodeURIComponent(season)}&matchday=${matchday}`),

  getAllDeals: (groupId: string, season: string, matchday: number): Promise<{ deals: CardDeal[] }> =>
    apiFetch(`${base(groupId)}/deals?season=${encodeURIComponent(season)}&matchday=${matchday}`),

  triggerDeal: (groupId: string, body: { season: string; matchday: number }): Promise<{ dealt: number }> =>
    apiFetch(`${base(groupId)}/deal`, json(body)),

  redealUser: (groupId: string, body: { season: string; matchday: number; userId: string }): Promise<{ deal: CardDeal }> =>
    apiFetch(`${base(groupId)}/redeal`, json(body)),

  redealAll: (groupId: string, body: { season: string; matchday: number }): Promise<{ redealt: number }> =>
    apiFetch(`${base(groupId)}/redeal-all`, json(body)),

  resetDeal: (groupId: string, dealId: string): Promise<{ deal: CardDeal }> =>
    apiFetch(`${base(groupId)}/reset`, json({ dealId })),

  recalculateCardEffects: (groupId: string, season: string): Promise<{ ok: boolean; matchdaysProcessed: number }> =>
    apiFetch(`${base(groupId)}/recalculate`, json({ season })),

  unlockCard: (groupId: string, dealId: string): Promise<{ deal: CardDeal }> =>
    apiFetch(`${base(groupId)}/unlock`, json({ dealId })),

  revealMimic: (groupId: string, dealId: string, targetUserId: string): Promise<{ deal: CardDeal }> =>
    apiFetch(`${base(groupId)}/mimic`, json({ dealId, targetUserId })),

  getPendingRetos: (groupId: string, season: string, matchday: number): Promise<{ pending: PendingReto[] }> =>
    apiFetch(`${base(groupId)}/reto/pending?season=${encodeURIComponent(season)}&matchday=${matchday}`),

  respondToReto: (groupId: string, playId: string, accept: boolean): Promise<{ play: CardPlay }> =>
    apiFetch(`${base(groupId)}/reto/respond`, json({ playId, accept })),

  playCard: (groupId: string, body: {
    dealId: string;
    matchId?: string;
    targetUserId?: string;
    params?: Record<string, unknown>;
  }): Promise<{ play: CardPlay; deal: CardDeal }> =>
    apiFetch(`${base(groupId)}/play`, json(body)),

  getActiveCardPlays: (groupId: string, season: string, matchday: number): Promise<{ plays: ActiveCardPlay[] }> =>
    apiFetch(`${base(groupId)}/active?season=${encodeURIComponent(season)}&matchday=${matchday}`),

  getPressConferenceReveals: (groupId: string, season: string): Promise<{
    reveals: Record<string, { alias: string; predictedHome: number; predictedAway: number }[]>;
  }> =>
    apiFetch(`${base(groupId)}/press-reveals?season=${encodeURIComponent(season)}`),

  getMySpyResults: (groupId: string, season: string): Promise<{
    results: Record<string, { alias: string; predictedHome: number; predictedAway: number }[]>;
  }> =>
    apiFetch(`${base(groupId)}/spy-results?season=${encodeURIComponent(season)}`),
};
