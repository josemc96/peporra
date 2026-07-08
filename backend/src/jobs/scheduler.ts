import cron from 'node-cron';
import { env } from '../config/env';
import { syncLaLigaMatches } from './syncMatches.job';
import { syncTopScorers } from './syncScorers.job';

export function startScheduledJobs(): void {
  if (!env.footballApiKey) {
    console.warn('FOOTBALL_API_KEY no configurada — se omite la sincronización automática de partidos');
    return;
  }

  // Cada 10 minutos (2 llamadas por ejecución = 288/día, muy por debajo del límite de 10/min).
  cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await syncLaLigaMatches(env.currentSeason);
      console.log(`Sincronización de partidos: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('Error al sincronizar partidos:', err);
    }

    try {
      const result = await syncTopScorers(env.currentSeason);
      console.log(`Sincronización de goleadores: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('Error al sincronizar goleadores:', err);
    }
  });
}
