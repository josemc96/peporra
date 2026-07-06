import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { startScheduledJobs } from './jobs/scheduler';

async function start(): Promise<void> {
  await connectDB();
  startScheduledJobs();

  app.listen(env.port, () => {
    console.log(`Servidor escuchando en el puerto ${env.port}`);
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
