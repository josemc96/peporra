import { Schema, model, Document, Types } from 'mongoose';
import { AwardType, PredictionStatus } from '../types/enums';

export interface IAwardPrediction extends Document {
  user: Types.ObjectId;
  season: string;
  award: AwardType;
  predictedPlayer: string;
  status: PredictionStatus;
}

const awardPredictionSchema = new Schema<IAwardPrediction>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  season: { type: String, required: true },
  award: { type: String, enum: ['pichichi', 'zamora'], required: true },
  predictedPlayer: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'scored'], default: 'pending' },
});

awardPredictionSchema.index({ user: 1, season: 1, award: 1 }, { unique: true });

export const AwardPrediction = model<IAwardPrediction>('AwardPrediction', awardPredictionSchema);
