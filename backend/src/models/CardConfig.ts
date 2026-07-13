import { Schema, model, Document, Types } from 'mongoose';
import { CardKey } from '../types/enums';

export interface ICardConfig extends Document {
  group: Types.ObjectId;
  season: string;
  enabledCards: CardKey[];
  melaJuegoLimit: number;
}

const CardConfigSchema = new Schema<ICardConfig>({
  group:          { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season:         { type: String, required: true },
  enabledCards:   { type: [String], default: [] },
  melaJuegoLimit: { type: Number, required: true, default: 10 },
});

CardConfigSchema.index({ group: 1, season: 1 }, { unique: true });

export const CardConfig = model<ICardConfig>('CardConfig', CardConfigSchema);
