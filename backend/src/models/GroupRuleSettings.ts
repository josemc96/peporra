import { Schema, model, Document, Types } from 'mongoose';
import { Competition } from '../types/enums';

export interface IGroupRuleConfig {
  rule: Types.ObjectId;
  points: number;
  active: boolean;
}

export type GroupFeature = 'standings' | 'pichichi' | 'zamora';

export interface IGroupRuleSettings extends Document {
  group: Types.ObjectId;
  season: string;
  rules: IGroupRuleConfig[];
  enabledCompetitions: Competition[];
  enabledFeatures: GroupFeature[];
}

const groupRuleConfigSchema = new Schema<IGroupRuleConfig>(
  {
    rule: { type: Schema.Types.ObjectId, ref: 'Rule', required: true },
    points: { type: Number, required: true },
    active: { type: Boolean, default: false },
  },
  { _id: false }
);

const groupRuleSettingsSchema = new Schema<IGroupRuleSettings>({
  group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  season: { type: String, required: true },
  rules: [groupRuleConfigSchema],
  enabledCompetitions: [{ type: String, enum: ['copa_del_rey', 'supercopa'] }],
  enabledFeatures: [{ type: String, enum: ['standings', 'pichichi', 'zamora'] }],
});

groupRuleSettingsSchema.index({ group: 1, season: 1 }, { unique: true });

export const GroupRuleSettings = model<IGroupRuleSettings>('GroupRuleSettings', groupRuleSettingsSchema);
