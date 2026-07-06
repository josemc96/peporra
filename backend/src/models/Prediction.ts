import { Schema, model, Document, Types } from 'mongoose';
import { PredictionStatus } from '../types/enums';

export interface IPrediction extends Document {
  user: Types.ObjectId;
  match: Types.ObjectId;
  predictedHome: number;
  predictedAway: number;
  status: PredictionStatus;
}

const predictionSchema = new Schema<IPrediction>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
  predictedHome: { type: Number, required: true },
  predictedAway: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'scored'], default: 'pending' },
});

predictionSchema.index({ user: 1, match: 1 }, { unique: true });

export const Prediction = model<IPrediction>('Prediction', predictionSchema);
