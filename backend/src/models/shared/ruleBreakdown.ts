import { Schema, Types } from 'mongoose';

export interface IRuleBreakdownItem {
  rule: Types.ObjectId;
  points: number;
}

export const ruleBreakdownSchema = new Schema<IRuleBreakdownItem>(
  {
    rule: { type: Schema.Types.ObjectId, ref: 'Rule', required: true },
    points: { type: Number, required: true },
  },
  { _id: false }
);
