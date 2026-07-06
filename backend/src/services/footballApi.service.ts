import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const BASE_URL = 'https://api.football-data.org/v4';
const LA_LIGA_CODE = 'PD'; // "Primera División" en football-data.org

export interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'SUSPENDED' | 'CANCELLED';
  matchday: number;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
}

interface FootballDataMatchesResponse {
  matches: FootballDataMatch[];
}

// El plan gratuito de football-data.org limita a 10 peticiones/minuto. Como este
// servicio se llama desde un cron (no desde requests de usuario), una llamada por
// ejecución es más que suficiente y no hace falta throttling adicional.
export async function fetchLaLigaMatches(seasonStartYear: string): Promise<FootballDataMatch[]> {
  if (!env.footballApiKey) {
    throw new AppError('FOOTBALL_API_KEY no está configurada', 500);
  }

  const url = `${BASE_URL}/competitions/${LA_LIGA_CODE}/matches?season=${seasonStartYear}`;
  const response = await fetch(url, {
    headers: { 'X-Auth-Token': env.footballApiKey },
  });

  if (!response.ok) {
    throw new AppError(`football-data.org devolvió ${response.status}: ${await response.text()}`, 502);
  }

  const data = (await response.json()) as FootballDataMatchesResponse;
  return data.matches;
}
