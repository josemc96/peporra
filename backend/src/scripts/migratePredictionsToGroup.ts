import { connectDB } from '../config/db';
import { Prediction } from '../models/Prediction';
import { Group } from '../models/Group';
import mongoose from 'mongoose';

async function main() {
  await connectDB();

  // Eliminar el índice viejo (user, match) — ya no es único, ahora es (user, match, group)
  try {
    await mongoose.connection.collection('predictions').dropIndex('user_1_match_1');
    console.log('Índice antiguo user_1_match_1 eliminado');
  } catch {
    console.log('Índice antiguo no encontrado (ya eliminado o nunca existió)');
  }

  // Predicciones sin campo group
  const orphans = await (Prediction as any).find({ group: { $exists: false } });
  console.log(`Predicciones sin grupo: ${orphans.length}`);

  let migrated = 0;
  let skipped = 0;
  let duplicated = 0;

  for (const pred of orphans) {
    const groups = await Group.find({ members: pred.user });

    if (groups.length === 0) {
      console.log(`  Sin grupo para usuario ${pred.user} — se ignora`);
      skipped++;
      continue;
    }

    for (const group of groups) {
      // Evitar duplicado si ya existe la combinación (user, match, group)
      const exists = await Prediction.findOne({ user: pred.user, match: pred.match, group: group._id });
      if (exists) {
        duplicated++;
        continue;
      }

      if (groups.length === 1) {
        // Solo un grupo: actualizar el documento existente
        await Prediction.updateOne({ _id: pred._id }, { $set: { group: group._id } });
      } else {
        // Varios grupos: crear copia para cada grupo adicional y actualizar el original con el primero
        if (group._id.toString() === groups[0]._id.toString()) {
          await Prediction.updateOne({ _id: pred._id }, { $set: { group: group._id } });
        } else {
          await Prediction.create({
            user: pred.user,
            match: pred.match,
            group: group._id,
            predictedHome: pred.predictedHome,
            predictedAway: pred.predictedAway,
            status: pred.status,
          });
        }
      }
      migrated++;
    }
  }

  console.log(`\nResultado: ${migrated} migradas, ${skipped} ignoradas (sin grupo), ${duplicated} ya existían`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
