import { connectDB } from '../config/db';
import { Prediction } from '../models/Prediction';
import { PredictionScore } from '../models/PredictionScore';
import mongoose from 'mongoose';

// One-time script: after migratePredictionsToGroup, copy predictions have no
// PredictionScore because the old scoring job created PSs pointing to pred_orig.
// This script re-points those PSs to the correct copy prediction.
//
// For each prediction with a group field that lacks a PS in that group:
//   1. Find the old PS for the same (user, match, group) via pred_orig
//   2. Create a new PS pointing to pred_copy with the same points
//   3. Delete the old PS (to avoid double-counting in ranking)

async function main() {
  await connectDB();

  const predictions = await Prediction.find({ group: { $exists: true } }).select('_id user match group status');
  console.log(`Total predicciones con grupo: ${predictions.length}`);

  let fixed = 0;
  let alreadyOk = 0;
  let noOldPs = 0;

  for (const pred of predictions) {
    // Check if PS already exists for this (prediction, group)
    const existing = await PredictionScore.findOne({ prediction: pred._id, group: pred.group });
    if (existing) {
      alreadyOk++;
      continue;
    }

    // No PS for this copy — find an old PS for the same (user, match) in the same group
    // The old PS would reference a different prediction (pred_orig) for the same user+match
    const siblings = await Prediction.find({
      user: pred.user,
      match: pred.match,
      _id: { $ne: pred._id },
    }).select('_id');

    const siblingIds = siblings.map((s) => s._id);
    if (siblingIds.length === 0) {
      // Single prediction for this user+match — should already have PS, skip
      noOldPs++;
      continue;
    }

    const oldPs = await PredictionScore.findOne({
      prediction: { $in: siblingIds },
      group: pred.group,
    });

    if (!oldPs) {
      noOldPs++;
      continue;
    }

    // Create new PS for the copy, with same points as old PS
    await PredictionScore.create({
      prediction: pred._id,
      group: pred.group,
      points: oldPs.points,
      preCardPoints: oldPs.preCardPoints ?? oldPs.points,
      ruleBreakdown: oldPs.ruleBreakdown ?? [],
      ...(oldPs.multiplierApplied != null && { multiplierApplied: oldPs.multiplierApplied }),
    });

    // Delete old PS (pred_orig → group) to avoid double-counting in ranking
    await PredictionScore.deleteOne({ _id: oldPs._id });

    fixed++;
    console.log(`  Migrado PS para pred ${pred._id} (grupo ${pred.group}) — ${oldPs.points} pts`);
  }

  console.log(`\nResultado: ${fixed} PSs migrados, ${alreadyOk} ya correctos, ${noOldPs} sin PS de origen`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
