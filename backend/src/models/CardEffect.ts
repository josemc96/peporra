import { Schema, model, Document, Types } from 'mongoose';
import { CardKey } from '../types/enums';

export interface ICardEffect extends Document {
  group: Types.ObjectId;
  season: string;
  matchday: number;
  user: Types.ObjectId;
  card: CardKey;
  points: number;
  sourceMatch?: Types.ObjectId;
}

const CardEffectSchema = new Schema<ICardEffect>({
  group:       { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season:      { type: String, required: true },
  matchday:    { type: Number, required: true },
  user:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  card:        { type: String, required: true },
  points:      { type: Number, required: true },
  sourceMatch: { type: Schema.Types.ObjectId, ref: 'Match' },
});

// One effect entry per user per card per matchday per group
CardEffectSchema.index({ group: 1, season: 1, matchday: 1, user: 1, card: 1 }, { unique: true });

export const CardEffect = model<ICardEffect>('CardEffect', CardEffectSchema);
