import { Schema, model, Document, Types } from 'mongoose';

export interface IMatchdayPenalty extends Document {
  group: Types.ObjectId;
  season: string;
  matchday: number;
  user: Types.ObjectId;
  position: number;
  amount: number;
}

const matchdayPenaltySchema = new Schema<IMatchdayPenalty>({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season: { type: String, required: true },
  matchday: { type: Number, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  position: { type: Number, required: true },
  amount: { type: Number, required: true },
});

matchdayPenaltySchema.index({ group: 1, season: 1, matchday: 1, user: 1 }, { unique: true });

export const MatchdayPenalty = model<IMatchdayPenalty>('MatchdayPenalty', matchdayPenaltySchema);
