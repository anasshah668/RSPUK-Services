import express from 'express';
import { body, validationResult } from 'express-validator';
import Quote from '../models/Quote.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/quotes
// @desc    Create new quote request
// @access  Public
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('phone').notEmpty().withMessage('Phone is required'),
  body('projectType').notEmpty().withMessage('Project type is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const quote = await Quote.create(req.body);
    res.status(201).json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/quotes
// @desc    Get all quotes (admin only)
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};

    const quotes = await Quote.find(query)
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Quote.countDocuments(query);

    res.json({
      quotes,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/quotes/:id
// @desc    Get single quote
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('respondedBy', 'name email');

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/quotes/:id
// @desc    Update quote (admin response)
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    quote.status = req.body.status || quote.status;
    quote.adminResponse = req.body.adminResponse || quote.adminResponse;
    quote.quotedPrice = req.body.quotedPrice || quote.quotedPrice;
    quote.respondedBy = req.user._id;
    quote.respondedAt = new Date();

    await quote.save();
    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
