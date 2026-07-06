import { Schema, model, Document, Types } from 'mongoose';
import { ruleBreakdownSchema, IRuleBreakdownItem } from './shared/ruleBreakdown';

export interface IPredictionScore extends Document {
  prediction: Types.ObjectId;
  group: Types.ObjectId;
  points: number;
  ruleBreakdown: IRuleBreakdownItem[];
  multiplierApplied?: number;
}

const predictionScoreSchema = new Schema<IPredictionScore>({
  prediction: { type: Schema.Types.ObjectId, ref: 'Prediction', required: true },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  points: { type: Number, required: true },
  ruleBreakdown: [ruleBreakdownSchema],
  multiplierApplied: { type: Number },
});

predictionScoreSchema.index({ prediction: 1, group: 1 }, { unique: true });

export const PredictionScore = model<IPredictionScore>('PredictionScore', predictionScoreSchema);
