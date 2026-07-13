import { Schema, model, Document, Types } from 'mongoose';

export interface IManualAdjustment extends Document {
  group: Types.ObjectId;
  season: string;
  user: Types.ObjectId;
  points: number;
  reason?: string;
  createdAt: Date;
}

const ManualAdjustmentSchema = new Schema<IManualAdjustment>(
  {
    group:  { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    season: { type: String, required: true },
    user:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    points: { type: Number, required: true },
    reason: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ManualAdjustment = model<IManualAdjustment>('ManualAdjustment', ManualAdjustmentSchema);
