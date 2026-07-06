import cron from 'node-cron';
import { env } from '../config/env';
import { syncLaLigaMatches } from './syncMatches.job';

export function startScheduledJobs(): void {
  if (!env.footballApiKey) {
    console.warn('FOOTBALL_API_KEY no configurada — se omite la sincronización automática de partidos');
    return;
  }

  // Cada 10 minutos (144 llamadas/día, muy por debajo del límite de 10/min de football-data.org).
  cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await syncLaLigaMatches(env.currentSeason);
      console.log(`Sincronización de partidos: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('Error al sincronizar partidos:', err);
    }
  });
}
