import express from 'express';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Quote from '../models/Quote.js';
import User from '../models/User.js';
import { protect, admin } from '../middleware/auth.js';
import { upload, uploadMultipleToCloudinary } from '../config/cloudinary.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(admin);

// ==================== PRODUCT MANAGEMENT ====================

// @route   POST /api/admin/products
// @desc    Create new product
// @access  Private/Admin
router.post('/products', (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('Product creation request received');
    console.log('Files:', req.files ? req.files.length : 0);
    console.log('Body:', req.body);
    
    // Validate required fields
    if (!req.body.name || !req.body.description || !req.body.category || !req.body.basePrice) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, description, category, basePrice' 
      });
    }

    let images = [];
    
    if (req.files && req.files.length > 0) {
      console.log('Uploading files to Cloudinary...');
      try {
        images = await uploadMultipleToCloudinary(req.files, 'printing-platform/products');
        console.log('Files uploaded successfully:', images.length);
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ 
          message: `Failed to upload images: ${uploadError.message}` 
        });
      }
    }

    // Convert basePrice to number and isActive to boolean
    // Normalize category to lowercase to match Category model
    const productData = {
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      category: req.body.category.trim().toLowerCase(),
      basePrice: parseFloat(req.body.basePrice),
      isActive: req.body.isActive === 'true' || req.body.isActive === true,
      images,
      createdBy: req.user._id,
    };

    // Optional JSON fields sent via multipart/form-data
    if (req.body.uiOptions) {
      try {
        productData.uiOptions = typeof req.body.uiOptions === 'string'
          ? JSON.parse(req.body.uiOptions)
          : req.body.uiOptions;
      } catch (e) {
        console.warn('Invalid uiOptions JSON, ignoring:', e?.message);
      }
    }
    if (req.body.sizeOptions) {
      try {
        productData.sizeOptions = typeof req.body.sizeOptions === 'string'
          ? JSON.parse(req.body.sizeOptions)
          : req.body.sizeOptions;
      } catch (e) {
        console.warn('Invalid sizeOptions JSON, ignoring:', e?.message);
      }
    }
    if (req.body.pricingTable) {
      try {
        productData.pricingTable = typeof req.body.pricingTable === 'string'
          ? JSON.parse(req.body.pricingTable)
          : req.body.pricingTable;
      } catch (e) {
        console.warn('Invalid pricingTable JSON, ignoring:', e?.message);
      }
    }

    // Validate basePrice
    if (isNaN(productData.basePrice) || productData.basePrice <= 0) {
      return res.status(400).json({ message: 'Invalid basePrice' });
    }

    console.log('Creating product with data:', productData);
    const product = await Product.create(productData);
    console.log('Product created successfully:', product._id);

    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   PUT /api/admin/products/:id
// @desc    Update product
// @access  Private/Admin
router.put('/products/:id', (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('Product update request received');
    console.log('Files:', req.files ? req.files.length : 0);
    console.log('Body:', req.body);

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = await uploadMultipleToCloudinary(req.files, 'printing-platform/products');
      product.images = [...product.images, ...newImages];
    }

    // Update product fields
    if (req.body.name) product.name = req.body.name.trim();
    if (req.body.description) product.description = req.body.description.trim();
    if (req.body.category) product.category = req.body.category.trim().toLowerCase();
    if (req.body.basePrice !== undefined) {
      const basePrice = parseFloat(req.body.basePrice);
      if (!isNaN(basePrice) && basePrice >= 0) {
        product.basePrice = basePrice;
      }
    }
    if (req.body.isActive !== undefined) {
      product.isActive = req.body.isActive === 'true' || req.body.isActive === true;
    }
    if (req.body.uiOptions !== undefined) {
      try {
        product.uiOptions = typeof req.body.uiOptions === 'string'
          ? JSON.parse(req.body.uiOptions)
          : req.body.uiOptions;
      } catch (e) {
        console.warn('Invalid uiOptions JSON, ignoring:', e?.message);
      }
    }
    if (req.body.sizeOptions !== undefined) {
      try {
        product.sizeOptions = typeof req.body.sizeOptions === 'string'
          ? JSON.parse(req.body.sizeOptions)
          : req.body.sizeOptions;
      } catch (e) {
        console.warn('Invalid sizeOptions JSON, ignoring:', e?.message);
      }
    }
    if (req.body.pricingTable !== undefined) {
      try {
        product.pricingTable = typeof req.body.pricingTable === 'string'
          ? JSON.parse(req.body.pricingTable)
          : req.body.pricingTable;
      } catch (e) {
        console.warn('Invalid pricingTable JSON, ignoring:', e?.message);
      }
    }

    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete product
// @access  Private/Admin
router.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await product.deleteOne();
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ORDER MANAGEMENT ====================

// @route   GET /api/admin/orders
// @desc    Get all orders
// @access  Private/Admin
router.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .populate('items.product')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Update order status
// @access  Private/Admin
router.put('/orders/:id/status', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = req.body.status;
    if (req.body.trackingNumber) {
      order.trackingNumber = req.body.trackingNumber;
    }

    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ANALYTICS ====================

// @route   GET /api/admin/analytics
// @desc    Get dashboard analytics
// @access  Private/Admin
router.get('/analytics', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const revenueByMonth = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalProducts = await Product.countDocuments();
    const totalQuotes = await Quote.countDocuments({ status: 'new' });

    res.json({
      overview: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalUsers,
        totalProducts,
        pendingQuotes: totalQuotes,
      },
      ordersByStatus,
      revenueByMonth,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
