import express from 'express';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// @route   GET /api/categories
// @desc    Get all active categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ order: 1, displayName: 1 })
      .select('-createdBy -__v');
    
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// All admin routes require authentication and admin role
router.use(protect);
router.use(admin);

// @route   GET /api/categories/admin/all
// @desc    Get all categories (including inactive) for admin
// @access  Private/Admin
router.get('/admin/all', async (req, res) => {
  try {
    const categories = await Category.find()
      .sort({ order: 1, displayName: 1 })
      .populate('createdBy', 'name email');
    
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private/Admin
router.post('/', async (req, res) => {
  try {
    const { name, displayName, description, order } = req.body;

    // Validate required fields
    if (!name || !displayName) {
      return res.status(400).json({ 
        message: 'Name and displayName are required' 
      });
    }

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({ 
      name: name.toLowerCase().trim() 
    });
    
    if (existingCategory) {
      return res.status(400).json({ 
        message: 'Category with this name already exists' 
      });
    }

    const category = await Category.create({
      name: name.toLowerCase().trim(),
      displayName: displayName.trim(),
      description: description?.trim() || '',
      order: order || 0,
      createdBy: req.user._id,
    });

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Category with this name already exists' 
      });
    }
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private/Admin
router.put('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const { name, displayName, description, isActive, order } = req.body;

    // If name is being changed, check for duplicates
    if (name && name.toLowerCase().trim() !== category.name) {
      const existingCategory = await Category.findOne({ 
        name: name.toLowerCase().trim(),
        _id: { $ne: req.params.id }
      });
      
      if (existingCategory) {
        return res.status(400).json({ 
          message: 'Category with this name already exists' 
        });
      }
      category.name = name.toLowerCase().trim();
    }

    if (displayName) category.displayName = displayName.trim();
    if (description !== undefined) category.description = description.trim();
    if (isActive !== undefined) category.isActive = isActive;
    if (order !== undefined) category.order = order;

    await category.save();
    res.json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Category with this name already exists' 
      });
    }
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private/Admin
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if any products are using this category
    const productsCount = await Product.countDocuments({ 
      category: category.name 
    });

    if (productsCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category. ${productsCount} product(s) are using this category. Please reassign or delete those products first.` 
      });
    }

    await category.deleteOne();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
