import mongoose from 'mongoose';
import { ALL_NUMERIC_SETTING_KEYS } from '../services/featuredSignagePricingFieldDefs.js';

const schemaFields = {
  categorySlug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  currency: { type: String, default: 'GBP' },
};

ALL_NUMERIC_SETTING_KEYS.forEach((key) => {
  schemaFields[key] = { type: Number, default: 0 };
});

const featuredSignagePricingSettingsSchema = new mongoose.Schema(schemaFields, {
  timestamps: true,
});

const FeaturedSignagePricingSettings = mongoose.model(
  'FeaturedSignagePricingSettings',
  featuredSignagePricingSettingsSchema
);

export default FeaturedSignagePricingSettings;
