import { Schema, model, Document, Types } from 'mongoose';

export interface IQualifierPredictionScore extends Document {
  qualifierPrediction: Types.ObjectId;
  group: Types.ObjectId;
  points: number;
  multiplierApplied?: number;
}

const qualifierPredictionScoreSchema = new Schema<IQualifierPredictionScore>({
  qualifierPrediction: { type: Schema.Types.ObjectId, ref: 'QualifierPrediction', required: true },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  points: { type: Number, required: true },
  multiplierApplied: { type: Number },
});

qualifierPredictionScoreSchema.index({ qualifierPrediction: 1, group: 1 }, { unique: true });

export const QualifierPredictionScore = model<IQualifierPredictionScore>(
  'QualifierPredictionScore',
  qualifierPredictionScoreSchema
);
