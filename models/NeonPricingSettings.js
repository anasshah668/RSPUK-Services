import mongoose from 'mongoose';

const neonPricingSettingsSchema = new mongoose.Schema(
  {
    currency: { type: String, default: 'GBP' },
    basePrice: { type: Number, default: 0 },
    widthCmRate: { type: Number, default: 0 },
    heightCmRate: { type: Number, default: 0 },
    tubeClassicAddon: { type: Number, default: 0 },
    tubeBoldAddon: { type: Number, default: 0 },
    backgroundWhiteAddon: { type: Number, default: 0 },
    backgroundBlackAddon: { type: Number, default: 0 },
    backgroundSilverAddon: { type: Number, default: 0 },
    backgroundYellowAddon: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const NeonPricingSettings = mongoose.model('NeonPricingSettings', neonPricingSettingsSchema);

export default NeonPricingSettings;
