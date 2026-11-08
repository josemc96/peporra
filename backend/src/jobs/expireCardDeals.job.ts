import { CardDeal } from '../models/CardDeal';
import { Match } from '../models/Match';
import { CardKey } from '../types/enums';

// Cartas de jornada completa: su plazo para jugarse cierra en el kickoff del PRIMER partido
// de la jornada (igual que valida cardPlay.controller.ts para la_aficion/dupla/reto). El
// resto de cartas se juegan sobre un partido concreto de la jornada, así que mientras quede
// algún partido sin empezar todavía se podrían jugar sobre ese — su plazo cierra en el
// kickoff del ÚLTIMO partido.
const JORNADA_WIDE_CARDS: CardKey[] = ['la_aficion', 'dupla', 'reto'];

/**
 * Marca como 'expired' las cartas (locked o pending, nunca jugadas) cuyo plazo ya ha
 * pasado. No cambia ninguna puntuación — solo corrige el estado para que la app no las
 * siga mostrando como jugables cuando ya no lo son (antes no existía ningún job que
 * transicionara a 'expired', así que se quedaban en 'pending'/'locked' para siempre).
 */
export async function expireCardDeals(): Promise<{ expired: number }> {
  const now = new Date();

  const unplayedDeals = await CardDeal.find({ status: { $in: ['locked', 'pending'] } })
    .select('_id season matchday card');
  if (unplayedDeals.length === 0) return { expired: 0 };

  const matchdayKeys = new Set(unplayedDeals.map((d) => `${d.season}|${d.matchday}`));
  const deadlineByKey = new Map<string, { first: Date; last: Date } | null>();

  for (const key of matchdayKeys) {
    const [season, matchdayStr] = key.split('|');
    const matchday = Number(matchdayStr);
    const matches = await Match.find({ competition: 'la_liga', season, matchday })
      .select('startTime')
      .sort({ startTime: 1 });
    if (matches.length === 0) {
      deadlineByKey.set(key, null); // sin partidos sincronizados todavía: no se puede saber
      continue;
    }
    deadlineByKey.set(key, { first: matches[0].startTime, last: matches[matches.length - 1].startTime });
  }

  let expired = 0;
  for (const deal of unplayedDeals) {
    const deadlines = deadlineByKey.get(`${deal.season}|${deal.matchday}`);
    if (!deadlines) continue;

    const deadline = JORNADA_WIDE_CARDS.includes(deal.card as CardKey) ? deadlines.first : deadlines.last;
    if (now >= deadline) {
      await CardDeal.updateOne({ _id: deal._id }, { status: 'expired' });
      expired++;
    }
  }

  return { expired };
}
