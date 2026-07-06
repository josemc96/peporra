import { Schema, model, Document } from 'mongoose';
import { UserRole } from '../types/enums';

export interface IUser extends Document {
  email: string;
  password: string;
  alias: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  alias: { type: String, required: true, trim: true },
  avatarUrl: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

export const User = model<IUser>('User', userSchema);
