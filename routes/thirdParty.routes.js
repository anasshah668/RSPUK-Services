import express from 'express';
import { admin, protect } from '../middleware/auth.js';
import Product from '../models/Product.js';
import {
  fetchThirdPartyProductAttributes,
  fetchThirdPartyProductAttributesByName,
  fetchThirdPartyProductPrices,
  getThirdPartyToken,
} from '../services/thirdPartyAuth.service.js';

const router = express.Router();
const ALLOWED_PRODUCT_KEYWORDS = [
  'business cards',
  'flyers',
  'leaflets',
  'brochures',
  'menus',
  'calendars',
  'stickers',
];

const getCategoryFromName = (name = '') => {
  const normalized = String(name).toLowerCase();
  if (normalized.includes('business card')) return 'business-cards';
  if (normalized.includes('flyer')) return 'flyers';
  if (normalized.includes('leaflet')) return 'leaflets';
  if (normalized.includes('brochure')) return 'brochures';
  if (normalized.includes('menu')) return 'menus';
  if (normalized.includes('calendar')) return 'calendars';
  if (normalized.includes('sticker')) return 'stickers';
  return 'third-party';
};

const syncThirdPartyProducts = async ({ forceRefresh = false } = {}) => {
  const data = await fetchThirdPartyProductAttributes({ forceRefresh });
  const filteredProducts = (data.products || []).filter((product) => {
    const name = String(product?.name || '').toLowerCase();
    return ALLOWED_PRODUCT_KEYWORDS.some((keyword) => name.includes(keyword));
  });

  const upsertedProducts = await Promise.all(
    filteredProducts.map(async (tpProduct) => {
      const update = {
        name: tpProduct.name,
        description: `${tpProduct.name} synced from Tradeprint`,
        category: getCategoryFromName(tpProduct.name),
        basePrice: 0,
        isActive: true,
        source: 'third-party',
        thirdPartyProductKey: tpProduct.productKey || null,
        thirdPartyAttributes: tpProduct.attributes || {},
      };

      return Product.findOneAndUpdate(
        { name: tpProduct.name, source: 'third-party' },
        {
          $set: update,
          $setOnInsert: {
            variants: [],
            features: [],
            // Keep a dedicated image field for admin upload/edit
            productImage: { url: '', publicId: '' },
            // Keep legacy images array compatible with existing UI
            images: [],
          },
        },
        { upsert: true, new: true }
      );
    })
  );

  return {
    raw: data.raw,
    filteredProducts,
    syncedCount: upsertedProducts.length,
  };
};

// @route   POST /api/third-party/auth/login
// @desc    Authenticate with third-party API and cache token
// @access  Private/Admin
router.post('/auth/login', protect, admin, async (req, res) => {
  try {
    const token = await getThirdPartyToken({ forceRefresh: true });
    res.json({
      success: true,
      message: 'Third-party authentication successful',
      tokenPreview: `${String(token).slice(0, 12)}...`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/third-party/auth/token
// @desc    Ensure token is available for subsequent API calls
// @access  Private/Admin
router.get('/auth/token', protect, admin, async (req, res) => {
  try {
    const token = await getThirdPartyToken();
    res.json({
      success: true,
      tokenPreview: `${String(token).slice(0, 12)}...`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/third-party/products/attributes
// @desc    Fetch product attributes from third-party API using backend token
// @access  Public (safe proxy response)
router.get('/products/attributes', async (req, res) => {
  try {
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const { raw, filteredProducts, syncedCount } = await syncThirdPartyProducts({ forceRefresh });

    res.json({
      success: true,
      result: raw,
      products: filteredProducts,
      syncedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/third-party/products/sync
// @desc    Manually sync selected third-party products into DB
// @access  Private/Admin
router.post('/products/sync', protect, admin, async (req, res) => {
  try {
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const { filteredProducts, syncedCount } = await syncThirdPartyProducts({ forceRefresh });
    res.json({
      success: true,
      message: 'Third-party products synced successfully',
      products: filteredProducts,
      syncedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/third-party/products/attributes/:productName
// @desc    Fetch attributes for a specific third-party product name
// @access  Public (safe proxy response)
router.get('/products/attributes/:productName', async (req, res) => {
  try {
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const data = await fetchThirdPartyProductAttributesByName(req.params.productName, { forceRefresh });
    res.json({
      success: true,
      result: data.raw,
      product: data.product,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/third-party/products/prices
// @desc    Fetch prices for a product based on production attributes
// @access  Public (safe proxy response)
router.post('/products/prices', async (req, res) => {
  try {
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const { productId, productionData, quantity, serviceLevel } = req.body || {};

    const data = await fetchThirdPartyProductPrices(
      { productId, productionData, quantity, serviceLevel },
      { forceRefresh }
    );

    res.json({
      success: true,
      result: data.raw,
      prices: data.prices,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

