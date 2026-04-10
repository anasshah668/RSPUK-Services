import mongoose from 'mongoose';

const neonPricingSettingsSchema = new mongoose.Schema(
  {
    currency: { type: String, default: 'GBP' },
    minimumPrice: { type: Number, default: 10 },
    basePrice: { type: Number, default: 59 },
    widthCmRate: { type: Number, default: 0.9 },
    heightCmRate: { type: Number, default: 1.2 },
    outdoorAddon: { type: Number, default: 25 },
    jacketColouredAddon: { type: Number, default: 0 },
    jacketWhiteAddon: { type: Number, default: 0 },
    tubeClassicAddon: { type: Number, default: 0 },
    tubeBoldAddon: { type: Number, default: 0 },
    remoteDimmerYesAddon: { type: Number, default: 0 },
    remoteDimmerNoAddon: { type: Number, default: 0 },
    powerBatteryAddon: { type: Number, default: 0 },
    powerAdaptorAddon: { type: Number, default: 0 },
    addOnShapeNoneAddon: { type: Number, default: 0 },
    addOnShapeHeartAddon: { type: Number, default: 0 },
    addOnShapeStarAddon: { type: Number, default: 0 },
    backgroundWhiteAddon: { type: Number, default: 0 },
    backgroundBlackAddon: { type: Number, default: 0 },
    backgroundSilverAddon: { type: Number, default: 0 },
    backgroundYellowAddon: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const NeonPricingSettings = mongoose.model('NeonPricingSettings', neonPricingSettingsSchema);

export default NeonPricingSettings;
