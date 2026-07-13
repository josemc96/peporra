import { Schema, model, Document, Types } from 'mongoose';

export interface IPenaltyEntry {
  position: number;
  amount: number;
}

export interface IPenaltyConfig extends Document {
  group: Types.ObjectId;
  season: string;
  penalties: IPenaltyEntry[];
}

const penaltyConfigSchema = new Schema<IPenaltyConfig>({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season: { type: String, required: true },
  penalties: [
    {
      position: { type: Number, required: true },
      amount: { type: Number, required: true, min: 0 },
      _id: false,
    },
  ],
});

penaltyConfigSchema.index({ group: 1, season: 1 }, { unique: true });

export const PenaltyConfig = model<IPenaltyConfig>('PenaltyConfig', penaltyConfigSchema);
