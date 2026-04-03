import express from 'express';
import Order from '../models/Order.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/orders
// @desc    Create new order
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const order = await Order.create({
      ...req.body,
      user: req.user._id,
    });

    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'name email')
      .populate('items.product');

    res.status(201).json(populatedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/orders
// @desc    Get user orders
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns the order or is admin
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/orders/track/:trackingNumber
// @desc    Public tracking lookup by tracking number
// @access  Public
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const order = await Order.findOne({ trackingNumber })
      .populate('items.product', 'name productImage images');

    if (!order) {
      return res.status(404).json({ message: 'Tracking number not found' });
    }

    // Return safe subset for public tracking
    res.json({
      trackingNumber: order.trackingNumber,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: (order.items || []).map((it) => ({
        productName: it.product?.name || 'Product',
        quantity: it.quantity,
        price: it.price,
        imageUrl: it.product?.productImage?.url || it.product?.images?.[0]?.url || null,
      })),
      shippingAddress: order.shippingAddress ? {
        city: order.shippingAddress.city,
        country: order.shippingAddress.country,
      } : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
