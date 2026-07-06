import { Schema, model, Document, Types } from 'mongoose';
import { MatchSide, PredictionStatus } from '../types/enums';

export interface IQualifierPrediction extends Document {
  user: Types.ObjectId;
  match: Types.ObjectId;
  predictedQualifier: MatchSide;
  status: PredictionStatus;
}

const qualifierPredictionSchema = new Schema<IQualifierPrediction>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
  predictedQualifier: { type: String, enum: ['home', 'away'], required: true },
  status: { type: String, enum: ['pending', 'scored'], default: 'pending' },
});

qualifierPredictionSchema.index({ user: 1, match: 1 }, { unique: true });

export const QualifierPrediction = model<IQualifierPrediction>('QualifierPrediction', qualifierPredictionSchema);
