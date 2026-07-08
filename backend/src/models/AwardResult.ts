import { Schema, model, Document } from 'mongoose';
import { AwardType } from '../types/enums';

export interface IAwardResult extends Document {
  season: string;
  award: AwardType;
  realPlayer: string;
}

const awardResultSchema = new Schema<IAwardResult>({
  season: { type: String, required: true },
  award: { type: String, enum: ['pichichi', 'zamora'], required: true },
  realPlayer: { type: String, required: true, trim: true },
});

awardResultSchema.index({ season: 1, award: 1 }, { unique: true });

export const AwardResult = model<IAwardResult>('AwardResult', awardResultSchema);
