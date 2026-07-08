import { Schema, model, Document } from 'mongoose';

export interface IScorer extends Document {
  season: string;
  externalPlayerId: number;
  playerName: string;
  team: string;
  goals: number;
  assists?: number;
  penalties?: number;
  playedMatches?: number;
}

const scorerSchema = new Schema<IScorer>({
  season: { type: String, required: true },
  externalPlayerId: { type: Number, required: true },
  playerName: { type: String, required: true },
  team: { type: String, required: true },
  goals: { type: Number, required: true },
  assists: { type: Number },
  penalties: { type: Number },
  playedMatches: { type: Number },
});

scorerSchema.index({ season: 1, externalPlayerId: 1 }, { unique: true });
scorerSchema.index({ season: 1, goals: -1 });

export const Scorer = model<IScorer>('Scorer', scorerSchema);
