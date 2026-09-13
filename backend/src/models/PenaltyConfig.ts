import { Schema, model, Document, Types } from 'mongoose';

export interface IPenaltyEntry {
  position: number;
  amount: number;
}

export interface IPenaltyConfig extends Document {
  group: Types.ObjectId;
  season: string;
  penalties: IPenaltyEntry[];
  // A partir de este número de partidos sin predecir en una jornada, el usuario queda
  // fuera del ranking de posiciones (penalties) de esa jornada y paga este importe fijo
  // en su lugar. amount = 0 desactiva la regla.
  missingPredictionsThreshold: number;
  missingPredictionsAmount: number;
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
  missingPredictionsThreshold: { type: Number, required: true, default: 3, min: 1 },
  missingPredictionsAmount: { type: Number, required: true, default: 3.5, min: 0 },
});

penaltyConfigSchema.index({ group: 1, season: 1 }, { unique: true });

export const PenaltyConfig = model<IPenaltyConfig>('PenaltyConfig', penaltyConfigSchema);
