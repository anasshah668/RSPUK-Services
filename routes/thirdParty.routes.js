import express from 'express';
import { admin, protect } from '../middleware/auth.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import {
  fetchThirdPartyProductAttributes,
  fetchThirdPartyProductAttributesByName,
  fetchThirdPartyExpectedDeliveryDate,
  fetchThirdPartyQuantities,
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

const getCategoryDisplayName = (categorySlug = '') => {
  if (!categorySlug) return 'Third Party';
  return String(categorySlug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const syncThirdPartyProducts = async ({ forceRefresh = false } = {}) => {
  const data = await fetchThirdPartyProductAttributes({ forceRefresh });
  const filteredProducts = (data.products || []).filter((product) => {
    const name = String(product?.name || '').toLowerCase();
    return ALLOWED_PRODUCT_KEYWORDS.some((keyword) => name.includes(keyword));
  });

  // Ensure categories exist in Category table so they appear in admin category management.
  const uniqueCategorySlugs = [...new Set(filteredProducts.map((p) => getCategoryFromName(p.name)))];
  const upsertedCategories = await Promise.all(
    uniqueCategorySlugs.map(async (categorySlug, index) =>
      Category.findOneAndUpdate(
        { name: categorySlug },
        {
          $set: {
            displayName: getCategoryDisplayName(categorySlug),
            isActive: true,
          },
          $setOnInsert: {
            name: categorySlug,
            description: `Auto-created from third-party sync for ${getCategoryDisplayName(categorySlug)}`,
            order: 100 + index,
          },
        },
        { upsert: true, new: true }
      )
    )
  );

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
    categoriesSynced: upsertedCategories.length,
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
    const { raw, filteredProducts, categoriesSynced, syncedCount } = await syncThirdPartyProducts({ forceRefresh });

    res.json({
      success: true,
      result: raw,
      products: filteredProducts,
      categoriesSynced,
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
    const { filteredProducts, categoriesSynced, syncedCount } = await syncThirdPartyProducts({ forceRefresh });
    res.json({
      success: true,
      message: 'Third-party products synced successfully',
      products: filteredProducts,
      categoriesSynced,
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

// @route   POST /api/third-party/products/expected-delivery-date
// @desc    Fetch expected delivery date based on product + production payload
// @access  Public (safe proxy response)
router.post('/products/expected-delivery-date', async (req, res) => {
  try {
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const {
      productId,
      productionData,
      serviceLevel,
      quantity,
      artworkService,
      deliveryAddress,
    } = req.body || {};

    const data = await fetchThirdPartyExpectedDeliveryDate(
      {
        productId,
        productionData,
        serviceLevel,
        quantity,
        artworkService,
        deliveryAddress,
      },
      { forceRefresh }
    );

    res.json({
      success: true,
      result: data.raw,
      expectedDeliveryDate: data.expectedDeliveryDate,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/third-party/products/quantities
// @desc    Fetch available quantities for a product based on production data and service level
// @access  Public (safe proxy response)
router.post('/products/quantities', async (req, res) => {
  try {
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true';
    const { productId, serviceLevel, productionData } = req.body || {};

    const data = await fetchThirdPartyQuantities(
      { productId, serviceLevel, productionData },
      { forceRefresh }
    );

    res.json({
      success: true,
      result: data.raw,
      quantities: data.quantities,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

