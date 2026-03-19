import express from 'express';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products
// @access  Public
router.get('/', async (req, res) => {
  try {
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
