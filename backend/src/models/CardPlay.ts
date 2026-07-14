import { Schema, model, Document, Types } from 'mongoose';

// params varía según la carta:
// el_var:      { side: 'home'|'away', delta: 1|-1 }
// me_la_juego: { amount: number }
// el_espia:    { copiedUserId?: string }
// resto:       {}
export interface ICardPlayParams {
  side?: 'home' | 'away';
  delta?: 1 | -1;
  amount?: number;
  copiedUserId?: string;
}

export interface ICardPlay extends Document {
  deal: Types.ObjectId;
  targetUser?: Types.ObjectId;
  targetMatch?: Types.ObjectId;
  params: ICardPlayParams;
  playedAt: Date;
}

const CardPlaySchema = new Schema<ICardPlay>({
  deal:        { type: Schema.Types.ObjectId, ref: 'CardDeal', required: true, unique: true },
  targetUser:  { type: Schema.Types.ObjectId, ref: 'User' },
  targetMatch: { type: Schema.Types.ObjectId, ref: 'Match' },
  params:      { type: Schema.Types.Mixed, default: {} },
  playedAt:    { type: Date, default: Date.now },
});

export const CardPlay = model<ICardPlay>('CardPlay', CardPlaySchema);
