import { Schema, model, Document, Types } from 'mongoose';

export interface IQualifierPredictionScore extends Document {
  prediction: Types.ObjectId;
  group: Types.ObjectId;
  points: number;
  multiplierApplied?: number;
}

const qualifierPredictionScoreSchema = new Schema<IQualifierPredictionScore>({
  prediction: { type: Schema.Types.ObjectId, ref: 'Prediction', required: true },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  points: { type: Number, required: true },
  multiplierApplied: { type: Number },
});

qualifierPredictionScoreSchema.index({ prediction: 1, group: 1 }, { unique: true });

export const QualifierPredictionScore = model<IQualifierPredictionScore>(
  'QualifierPredictionScore',
  qualifierPredictionScoreSchema
);
