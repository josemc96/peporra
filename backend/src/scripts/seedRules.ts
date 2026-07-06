import { connectDB } from '../config/db';
import { Rule } from '../models/Rule';
import mongoose from 'mongoose';

const ruleCatalog = [
  { key: 'exact_score', scope: 'match', name: 'Resultado exacto', defaultPoints: 3 },
  { key: 'correct_sign', scope: 'match', name: 'Acertar signo (1X2)', defaultPoints: 1 },
  { key: 'standings_position', scope: 'standings', name: 'Posición exacta en la tabla', defaultPoints: 2 },
  { key: 'pichichi_correct', scope: 'award', name: 'Acertar Pichichi', defaultPoints: 5 },
  { key: 'zamora_correct', scope: 'award', name: 'Acertar Zamora', defaultPoints: 5 },
  {
    key: 'knockout_qualifier',
    scope: 'knockout',
    name: 'Acertar quién se clasifica (empate a 90\')',
    defaultPoints: 2,
  },
] as const;

async function seedRules(): Promise<void> {
  await connectDB();

  for (const rule of ruleCatalog) {
    await Rule.findOneAndUpdate({ key: rule.key }, rule, { upsert: true, returnDocument: 'after' });
    console.log(`Regla sincronizada: ${rule.key}`);
  }

  await mongoose.disconnect();
}

seedRules().catch((err) => {
  console.error('Error al sembrar el catálogo de reglas:', err);
  process.exit(1);
});
