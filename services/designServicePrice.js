import SiteSetting from '../models/SiteSetting.js';

export const DESIGN_SERVICE_PRICE_KEY = 'designServicePrice';
export const DEFAULT_DESIGN_SERVICE_PRICE_GBP = 50;

function normalizePrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function buildDesignServicePrice(price, vatInclusive = true) {
  return {
    price: normalizePrice(price) ?? DEFAULT_DESIGN_SERVICE_PRICE_GBP,
    currency: 'GBP',
    vatInclusive: vatInclusive !== false,
    label: 'Professional design service',
  };
}

export async function getDesignServicePrice() {
  try {
    const setting = await SiteSetting.findOne({ key: DESIGN_SERVICE_PRICE_KEY }).lean();
    const storedPrice = normalizePrice(setting?.value?.price);
    if (storedPrice) {
      return buildDesignServicePrice(storedPrice, setting?.value?.vatInclusive);
    }
  } catch (error) {
    console.warn('[designServicePrice] DB read failed:', error?.message || error);
  }

  const fromEnv = normalizePrice(process.env.DESIGN_SERVICE_PRICE_GBP);
  return buildDesignServicePrice(fromEnv ?? DEFAULT_DESIGN_SERVICE_PRICE_GBP);
}

export async function saveDesignServicePrice({ price, vatInclusive = true } = {}) {
  const normalized = normalizePrice(price);
  if (!normalized) {
    throw new Error('Valid price is required (must be greater than 0).');
  }

  const payload = buildDesignServicePrice(normalized, vatInclusive);

  await SiteSetting.findOneAndUpdate(
    { key: DESIGN_SERVICE_PRICE_KEY },
    { key: DESIGN_SERVICE_PRICE_KEY, value: payload },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return payload;
}

export function isValidDesignServiceChargeAmount(requestDoc, chargedAmount) {
  if (!requestDoc) return false;
  const expected = Number(requestDoc.priceAmount);
  const charged = Number(chargedAmount);
  if (!Number.isFinite(expected) || !Number.isFinite(charged)) return false;
  return Math.abs(charged - expected) < 0.02;
}
