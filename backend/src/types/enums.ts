export type UserRole = 'user' | 'admin';

// 'postponed': football-data.org lo marcó POSTPONED o CANCELLED (aún no se sabe cuándo se
// juega de verdad) — solo afecta a cómo se MUESTRA (nunca "en vivo", nunca se puntúa).
// El bloqueo de predicciones sigue dependiendo únicamente de `startTime`: mientras el
// partido siga "postponed" con la fecha antigua, se mantiene BLOQUEADO (no editable) — en
// cuanto la API confirme fecha nueva, el sync lo devuelve a 'pending' con el startTime ya
// actualizado a futuro, y ahí sí vuelve a ser editable de forma natural.
export type MatchStatus = 'pending' | 'finished' | 'postponed';

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
  | 'me_la_juego'
  | 'mimo'
  | 'dupla'
  | 'espejo'
  | 'comodin'
  | 'borracho'
  | 'reto';

export const ALL_CARD_KEYS: CardKey[] = [
  'la_mina', 'la_roja', 'la_lesion', 'el_var', 'el_autobus',
  'el_espia', 'rueda_prensa', 'la_aficion', 'el_doblete', 'me_la_juego',
  'mimo', 'dupla', 'espejo', 'comodin', 'borracho', 'reto',
];

export type CardDealStatus = 'locked' | 'pending' | 'played' | 'expired';
