import express from 'express';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';
import { fetchThirdPartyProductAttributes } from '../services/thirdPartyAuth.service.js';

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

const syncThirdPartyProductsIfNeeded = async () => {
  const alreadySynced = await Product.exists({ source: 'third-party' });
  if (alreadySynced) return;

  const data = await fetchThirdPartyProductAttributes();
  const filteredProducts = (data.products || []).filter((product) => {
    const name = String(product?.name || '').toLowerCase();
    return ALLOWED_PRODUCT_KEYWORDS.some((keyword) => name.includes(keyword));
  });

  await Promise.all(
    filteredProducts.map((tpProduct) =>
      Product.findOneAndUpdate(
        { name: tpProduct.name, source: 'third-party' },
        {
          $set: {
            name: tpProduct.name,
            description: `${tpProduct.name} synced from Tradeprint`,
            category: getCategoryFromName(tpProduct.name),
            basePrice: 0,
            isActive: true,
            source: 'third-party',
            thirdPartyProductKey: tpProduct.productKey || null,
            thirdPartyAttributes: tpProduct.attributes || {},
          },
          $setOnInsert: {
            variants: [],
            features: [],
            productImage: { url: '', publicId: '' },
            images: [],
          },
        },
        { upsert: true, new: true }
      )
    )
  );
};

// @route   GET /api/products
// @desc    Get all products
// @access  Public
router.get('/', async (req, res) => {
  try {
    await syncThirdPartyProductsIfNeeded();
    const { category, page = 1, limit = 12 } = req.query;
    const query = category ? { category, isActive: true } : { isActive: true };
    
    const products = await Product.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/products/category/:category
// @desc    Get products by category
// @access  Public
router.get('/category/:category', async (req, res) => {
  try {
    const products = await Product.find({ 
      category: req.params.category,
      isActive: true 
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/products/recommended
// @desc    Get recommended products (mix of isRecommended=true and popular products)
// @access  Public
router.get('/recommended', async (req, res) => {
  try {
    const { limit = 8, category } = req.query;
    const limitNum = parseInt(limit, 10);
    
    // Build query
    const query = { isActive: true };
    if (category) {
      query.category = category;
    }
    
    // Get recommended products first (isRecommended = true)
    const recommended = await Product.find({ ...query, isRecommended: true })
      .limit(limitNum)
      .sort({ createdAt: -1 });
    
    // If we need more, get popular products (most recent, excluding already fetched)
    const recommendedIds = recommended.map(p => p._id);
    const remaining = limitNum - recommended.length;
    
    let popular = [];
    if (remaining > 0) {
      popular = await Product.find({
        ...query,
        _id: { $nin: recommendedIds }
      })
        .limit(remaining)
        .sort({ createdAt: -1 });
    }
    
    // Combine and return
    const products = [...recommended, ...popular];
    
    res.json({
      products,
      total: products.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
