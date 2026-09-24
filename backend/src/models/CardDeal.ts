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
  unlockedAt?: Date;
  // Mimo: al elegir a quién copiar, `card` se sobreescribe con el tipo copiado (para que
  // el resto del sistema — puntuación, reveal, spy, etc. — la trate como esa carta real sin
  // más cambios), y estos dos campos quedan como rastro de que en realidad era Mimo.
  mimicked?: boolean;
  mimicSource?: Types.ObjectId;
}

const CardDealSchema = new Schema<ICardDeal>({
  group:       { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season:      { type: String, required: true },
  matchday:    { type: Number, required: true },
  user:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  card:        { type: String, required: true },
  status:      { type: String, enum: ['locked', 'pending', 'played', 'expired'], default: 'locked' },
  dealtAt:     { type: Date, default: Date.now },
  unlockedAt:  { type: Date },
  mimicked:    { type: Boolean },
  mimicSource: { type: Schema.Types.ObjectId, ref: 'User' },
});

CardDealSchema.index({ group: 1, season: 1, matchday: 1, user: 1 }, { unique: true });

export const CardDeal = model<ICardDeal>('CardDeal', CardDealSchema);
