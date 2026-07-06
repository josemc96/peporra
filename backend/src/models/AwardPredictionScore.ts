import { Schema, model, Document, Types } from 'mongoose';

export interface IAwardPredictionScore extends Document {
  awardPrediction: Types.ObjectId;
  group: Types.ObjectId;
  points: number;
}

const awardPredictionScoreSchema = new Schema<IAwardPredictionScore>({
  awardPrediction: { type: Schema.Types.ObjectId, ref: 'AwardPrediction', required: true },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  points: { type: Number, required: true },
});

awardPredictionScoreSchema.index({ awardPrediction: 1, group: 1 }, { unique: true });

export const AwardPredictionScore = model<IAwardPredictionScore>('AwardPredictionScore', awardPredictionScoreSchema);
