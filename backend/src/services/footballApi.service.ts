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

export interface FootballDataScorer {
  player: { id: number; name: string };
  team: { name: string };
  goals: number;
  assists: number | null;
  penalties: number | null;
  playedMatches: number | null;
}

interface FootballDataMatchesResponse {
  matches: FootballDataMatch[];
}

interface FootballDataScorersResponse {
  scorers: FootballDataScorer[];
}

// El plan gratuito de football-data.org limita a 10 peticiones/minuto. Como este
// servicio se llama desde un cron (no desde requests de usuario), unas pocas llamadas
// por ejecución son más que suficientes y no hace falta throttling adicional.
async function getFromFootballData<T>(path: string): Promise<T> {
  if (!env.footballApiKey) {
    throw new AppError('FOOTBALL_API_KEY no está configurada', 500);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': env.footballApiKey },
  });

  if (!response.ok) {
    throw new AppError(`football-data.org devolvió ${response.status}: ${await response.text()}`, 502);
  }

  return response.json() as Promise<T>;
}

export async function fetchLaLigaMatches(seasonStartYear: string): Promise<FootballDataMatch[]> {
  const data = await getFromFootballData<FootballDataMatchesResponse>(
    `/competitions/${LA_LIGA_CODE}/matches?season=${seasonStartYear}`
  );
  return data.matches;
}

export async function fetchTopScorers(seasonStartYear: string, limit = 20): Promise<FootballDataScorer[]> {
  const data = await getFromFootballData<FootballDataScorersResponse>(
    `/competitions/${LA_LIGA_CODE}/scorers?season=${seasonStartYear}&limit=${limit}`
  );
  return data.scorers;
}
