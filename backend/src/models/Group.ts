import { Schema, model, Document, Types } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  inviteCode: string;
  admin: Types.ObjectId;
  members: Types.ObjectId[];
  season: string;
  createdAt: Date;
}

const groupSchema = new Schema<IGroup>({
  name: { type: String, required: true, trim: true },
  inviteCode: { type: String, required: true, unique: true },
  admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  season: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Group = model<IGroup>('Group', groupSchema);
