import { Schema, model, Document } from 'mongoose';
import { Competition, MatchStatus } from '../types/enums';

export interface IMatch extends Document {
  season: string;
  competition: Competition;
  matchday?: number;
  isKnockout: boolean;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
  externalId?: number;
}

const matchSchema = new Schema<IMatch>({
  season: { type: String, required: true },
  competition: { type: String, enum: ['la_liga', 'copa_del_rey', 'supercopa'], default: 'la_liga' },
  matchday: {
    type: Number,
    required: function (this: IMatch) {
      return this.competition === 'la_liga';
    },
  },
  isKnockout: { type: Boolean, default: false },
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  startTime: { type: Date, required: true },
  homeScore: { type: Number },
  awayScore: { type: Number },
  status: { type: String, enum: ['pending', 'finished'], default: 'pending' },
  // id del partido en football-data.org — permite upsert fiable al sincronizar (los
  // partidos de Copa del Rey/Supercopa, dados de alta a mano, no tienen externalId.
  externalId: { type: Number, unique: true, sparse: true },
});

matchSchema.index({ season: 1, matchday: 1 });
matchSchema.index({ season: 1, competition: 1 });

export const Match = model<IMatch>('Match', matchSchema);
