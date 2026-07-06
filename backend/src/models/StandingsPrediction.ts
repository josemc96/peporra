import { Schema, model, Document, Types } from 'mongoose';
import { PredictionStatus, StandingsPhase } from '../types/enums';

export interface IStandingsTableEntry {
  position: number;
  team: string;
}

export interface IStandingsPrediction extends Document {
  user: Types.ObjectId;
  season: string;
  phase: StandingsPhase;
  predictedTable: IStandingsTableEntry[];
  status: PredictionStatus;
}

const standingsTableEntrySchema = new Schema<IStandingsTableEntry>(
  {
    position: { type: Number, required: true },
    team: { type: String, required: true },
  },
  { _id: false }
);

const standingsPredictionSchema = new Schema<IStandingsPrediction>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  season: { type: String, required: true },
  phase: { type: String, enum: ['ida', 'vuelta'], required: true },
  predictedTable: [standingsTableEntrySchema],
  status: { type: String, enum: ['pending', 'scored'], default: 'pending' },
});

standingsPredictionSchema.index({ user: 1, season: 1, phase: 1 }, { unique: true });

export const StandingsPrediction = model<IStandingsPrediction>('StandingsPrediction', standingsPredictionSchema);
