import NeonPricingSettings from '../models/NeonPricingSettings.js';
import { computeNeonPrice } from '../services/neonPricingCalculator.js';

async function getOrCreateSettings() {
  let doc = await NeonPricingSettings.findOne();
  if (!doc) {
    doc = await NeonPricingSettings.create({});
  }
  return doc;
}

export const getNeonPricingSettings = async (req, res) => {
  try {
    const doc = await getOrCreateSettings();
    res.json(doc.toObject());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateNeonPricingSettings = async (req, res) => {
  try {
    const allowed = [
      'currency',
      'basePrice',
      'widthCmRate',
      'heightCmRate',
      'outdoorAddon',
      'jacketColouredAddon',
      'jacketWhiteAddon',
      'tubeClassicAddon',
      'tubeBoldAddon',
      'remoteDimmerYesAddon',
      'remoteDimmerNoAddon',
      'powerBatteryAddon',
      'powerAdaptorAddon',
      'addOnShapeNoneAddon',
      'addOnShapeHeartAddon',
      'addOnShapeStarAddon',
      'backgroundWhiteAddon',
      'backgroundBlackAddon',
      'backgroundSilverAddon',
      'backgroundYellowAddon',
    ];

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined && req.body[key] !== null && req.body[key] !== '') {
        const n = Number(req.body[key]);
        if (!Number.isNaN(n)) {
          update[key] = n;
        }
      }
    }
    if (req.body.currency !== undefined && typeof req.body.currency === 'string') {
      update.currency = req.body.currency.trim().slice(0, 8);
    }

    const doc = await getOrCreateSettings();
    Object.assign(doc, update);
    await doc.save();
    res.json(doc.toObject());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const calculateNeonPricePublic = async (req, res) => {
  try {
    const {
      width,
      height,
      environment,
      jacket,
      tubeThickness,
      remoteDimmer,
      powerMode,
      addOnShape,
      backgroundColor,
      presetPrice,
    } = req.body || {};

    const settings = await getOrCreateSettings();
    const s = settings.toObject();

    const price = computeNeonPrice(
      {
        width,
        height,
        environment,
        jacket,
        tubeThickness,
        remoteDimmer,
        powerMode,
        addOnShape,
        backgroundColor,
        presetPrice,
      },
      s
    );

    res.json({
      price,
      currency: s.currency || 'GBP',
      breakdown: {
        width,
        height,
        environment,
        jacket,
        tubeThickness,
        remoteDimmer,
        powerMode,
        addOnShape,
        backgroundColor,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
