import { apiFetch } from './client';

export type CardKey =
  | 'la_mina' | 'la_roja' | 'la_lesion' | 'el_var' | 'el_autobus'
  | 'el_espia' | 'rueda_prensa' | 'la_aficion' | 'el_doblete' | 'me_la_juego';

export const ALL_CARD_KEYS: CardKey[] = [
  'la_mina', 'la_roja', 'la_lesion', 'el_var', 'el_autobus',
  'el_espia', 'rueda_prensa', 'la_aficion', 'el_doblete', 'me_la_juego',
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
};

export const CARD_DESCRIPTIONS: Record<CardKey, string> = {
  la_mina: 'Quienes coincidan con tu resultado ese partido puntúan 0.',
  la_roja: 'Un rival pierde sus puntos en un partido.',
  la_lesion: 'Un rival obtiene la mitad de puntos en un partido.',
  el_var: 'Modifica tu predicción de un partido ya iniciado (±1 al marcador).',
  el_autobus: 'Quedas inmune en un partido y tienes mínimo 1 punto.',
  el_espia: 'Consulta la predicción de un rival antes del partido.',
  rueda_prensa: 'Añade puntos extras a tu predicción en un partido.',
  la_aficion: 'Recibes la mitad de puntos de un rival que quede en el podio de jornada.',
  el_doblete: 'Doblas tus puntos base en un partido.',
  me_la_juego: 'Apuesta X puntos en un partido: si aciertas resultado exacto ganas X, si no pierdes X/2.',
};

export type CardDealStatus = 'pending' | 'played' | 'expired';

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
}

export interface CardPlay {
  _id: string;
  deal: string;
  targetUser?: string;
  targetMatch?: string;
  params: { side?: 'home' | 'away'; delta?: number; amount?: number; copiedUserId?: string };
  playedAt: string;
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

  playCard: (groupId: string, body: {
    season: string;
    matchday: number;
    targetMatchId?: string;
    targetUserId?: string;
    params?: Record<string, unknown>;
  }): Promise<{ play: CardPlay }> =>
    apiFetch(`${base(groupId)}/play`, json(body)),

  getActiveCardPlays: (groupId: string, season: string, matchday: number): Promise<{ plays: Array<{ card: CardKey; userId: string; targetMatchId?: string; targetUserId?: string }> }> =>
    apiFetch(`${base(groupId)}/active?season=${encodeURIComponent(season)}&matchday=${matchday}`),
};
