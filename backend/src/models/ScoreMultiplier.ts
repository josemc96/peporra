import { Schema, model, Document, Types } from 'mongoose';
import { MultiplierScope } from '../types/enums';

export interface IScoreMultiplier extends Document {
  group: Types.ObjectId;
  season: string;
  scope: MultiplierScope;
  match?: Types.ObjectId;
  matchday?: number;
  multiplier: number;
}

const scoreMultiplierSchema = new Schema<IScoreMultiplier>({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season: { type: String, required: true },
  scope: { type: String, enum: ['match', 'matchday'], required: true },
  match: {
    type: Schema.Types.ObjectId,
    ref: 'Match',
    required: function (this: IScoreMultiplier) {
      return this.scope === 'match';
    },
  },
  matchday: {
    type: Number,
    required: function (this: IScoreMultiplier) {
      return this.scope === 'matchday';
    },
  },
  multiplier: { type: Number, required: true, min: 1 },
});

scoreMultiplierSchema.index({ group: 1, scope: 1, match: 1 });
scoreMultiplierSchema.index({ group: 1, scope: 1, matchday: 1 });

export const ScoreMultiplier = model<IScoreMultiplier>('ScoreMultiplier', scoreMultiplierSchema);
