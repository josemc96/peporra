import { Schema, model, Document } from 'mongoose';
import { RuleScope } from '../types/enums';

export interface IRule extends Document {
  key: string;
  scope: RuleScope;
  name: string;
  description?: string;
  defaultPoints: number;
}

const ruleSchema = new Schema<IRule>({
  key: { type: String, required: true, unique: true },
  scope: { type: String, enum: ['match', 'standings', 'award'], required: true },
  name: { type: String, required: true },
  description: { type: String },
  defaultPoints: { type: Number, required: true },
});

export const Rule = model<IRule>('Rule', ruleSchema);
