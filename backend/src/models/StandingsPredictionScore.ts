import { Schema, model, Document, Types } from 'mongoose';
import { ruleBreakdownSchema, IRuleBreakdownItem } from './shared/ruleBreakdown';

export interface IStandingsPredictionScore extends Document {
  standingsPrediction: Types.ObjectId;
  group: Types.ObjectId;
  points: number;
  ruleBreakdown: IRuleBreakdownItem[];
}

const standingsPredictionScoreSchema = new Schema<IStandingsPredictionScore>({
  standingsPrediction: { type: Schema.Types.ObjectId, ref: 'StandingsPrediction', required: true },
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  points: { type: Number, required: true },
  ruleBreakdown: [ruleBreakdownSchema],
});

standingsPredictionScoreSchema.index({ standingsPrediction: 1, group: 1 }, { unique: true });

export const StandingsPredictionScore = model<IStandingsPredictionScore>(
  'StandingsPredictionScore',
  standingsPredictionScoreSchema
);
