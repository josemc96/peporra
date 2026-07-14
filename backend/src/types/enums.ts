export type UserRole = 'user' | 'admin';

export type MatchStatus = 'pending' | 'finished';

export type PredictionStatus = 'pending' | 'scored';

export type RuleScope = 'match' | 'standings' | 'award' | 'knockout';

export type StandingsPhase = 'ida' | 'vuelta';

export type AwardType = 'pichichi' | 'zamora';

export type MultiplierScope = 'match' | 'matchday';

export type Competition = 'la_liga' | 'copa_del_rey' | 'supercopa';

export type MatchSide = 'home' | 'away';

export type CardKey =
  | 'la_mina'
  | 'la_roja'
  | 'la_lesion'
  | 'el_var'
  | 'el_autobus'
  | 'el_espia'
  | 'rueda_prensa'
  | 'la_aficion'
  | 'el_doblete'
  | 'me_la_juego';

export const ALL_CARD_KEYS: CardKey[] = [
  'la_mina', 'la_roja', 'la_lesion', 'el_var', 'el_autobus',
  'el_espia', 'rueda_prensa', 'la_aficion', 'el_doblete', 'me_la_juego',
];

export type CardDealStatus = 'pending' | 'played' | 'expired';
