import FeaturedSignagePricingSettings from '../models/FeaturedSignagePricingSettings.js';
import {
  ALL_NUMERIC_SETTING_KEYS,
  getDefaultSettingsForCategory,
} from '../services/featuredSignagePricingFieldDefs.js';
import { computeFeaturedSignagePrice } from '../services/featuredSignagePricingCalculator.js';

async function getSettingsForCategory(categorySlug) {
  const slug = String(categorySlug || '_default').toLowerCase();
  let doc = await FeaturedSignagePricingSettings.findOne({ categorySlug: slug });
  if (!doc && slug !== '_default') {
    doc = await FeaturedSignagePricingSettings.findOne({ categorySlug: '_default' });
  }
  if (!doc) {
    const defaults = getDefaultSettingsForCategory(slug);
    doc = await FeaturedSignagePricingSettings.findOneAndUpdate(
      { categorySlug: slug },
      { $setOnInsert: defaults },
      { upsert: true, new: true }
    );
  }
  return doc;
}

function pickNumericUpdate(body) {
  const update = {};
  for (const key of ALL_NUMERIC_SETTING_KEYS) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      const n = Number(body[key]);
      if (!Number.isNaN(n)) update[key] = n;
    }
  }
  if (body.currency !== undefined && typeof body.currency === 'string') {
    update.currency = body.currency.trim().slice(0, 8);
  }
  return update;
}

export const listFeaturedSignagePricingAdmin = async (req, res) => {
  try {
    const docs = await FeaturedSignagePricingSettings.find().sort({ categorySlug: 1 }).lean();
    res.json({ settings: docs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFeaturedSignagePricingAdmin = async (req, res) => {
  try {
    const slug = String(req.params.categorySlug || '_default').toLowerCase();
    const doc = await getSettingsForCategory(slug);
    res.json(doc.toObject());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateFeaturedSignagePricingAdmin = async (req, res) => {
  try {
    const slug = String(req.params.categorySlug || '_default').toLowerCase();
    const update = pickNumericUpdate(req.body || {});
    const doc = await FeaturedSignagePricingSettings.findOneAndUpdate(
      { categorySlug: slug },
      { $set: { categorySlug: slug, ...update } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(doc.toObject());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const calculateFeaturedSignagePricePublic = async (req, res) => {
  try {
    const {
      categorySlug,
      width,
      height,
      unit,
      quantity,
      usage,
      installationRequired,
      deliveryRequired,
      rushOrder,
      designServiceRequired,
      productSpecific,
    } = req.body || {};

    const slug = String(categorySlug || '_default').toLowerCase();
    const settingsDoc = await getSettingsForCategory(slug);
    const settings = settingsDoc.toObject();

    const result = computeFeaturedSignagePrice(
      {
        categorySlug: slug,
        width,
        height,
        unit,
        quantity,
        usage,
        installationRequired,
        deliveryRequired,
        rushOrder,
        designServiceRequired,
        productSpecific: productSpecific || {},
      },
      settings
    );

    res.json({
      ...result,
      categorySlug: slug,
      pricingBasis: 'net',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
