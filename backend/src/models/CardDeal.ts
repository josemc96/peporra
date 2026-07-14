import { Schema, model, Document, Types } from 'mongoose';
import { CardKey, CardDealStatus } from '../types/enums';

export interface ICardDeal extends Document {
  group: Types.ObjectId;
  season: string;
  matchday: number;
  user: Types.ObjectId;
  card: CardKey;
  status: CardDealStatus;
  dealtAt: Date;
}

const CardDealSchema = new Schema<ICardDeal>({
  group:    { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season:   { type: String, required: true },
  matchday: { type: Number, required: true },
  user:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  card:     { type: String, required: true },
  status:   { type: String, enum: ['pending', 'played', 'expired'], default: 'pending' },
  dealtAt:  { type: Date, default: Date.now },
});

CardDealSchema.index({ group: 1, season: 1, matchday: 1, user: 1 }, { unique: true });

export const CardDeal = model<ICardDeal>('CardDeal', CardDealSchema);
