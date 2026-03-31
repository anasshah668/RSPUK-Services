import express from 'express';
import { admin, protect } from '../middleware/auth.js';
import {
  fetchThirdPartyProductAttributes,
  fetchThirdPartyProductAttributesByName,
  getThirdPartyToken,
} from '../services/thirdPartyAuth.service.js';

const router = express.Router();

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
    const data = await fetchThirdPartyProductAttributes({ forceRefresh });
    res.json({
      success: true,
      result: data.raw,
      products: data.products,
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

export default router;

