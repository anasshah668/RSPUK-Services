import express from 'express';
import { protect } from '../middleware/auth.js';
import { artworkUpload, uploadArtworkToCloudinary } from '../config/cloudinary.js';

const router = express.Router();

// @route   POST /api/uploads/artwork
// @desc    Upload a single artwork file (image or PDF) to Cloudinary
//          and return its hosted URL. Used by the product detail page so
//          we can pass a real `fileUrls` entry to Tradeprint at checkout.
// @access  Private
router.post(
  '/artwork',
  protect,
  (req, res, next) => {
    artworkUpload.single('file')(req, res, (err) => {
      if (err) {
        const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No artwork file uploaded.' });
      }

      const result = await uploadArtworkToCloudinary(
        req.file.buffer,
        req.file.originalname,
      );

      res.status(201).json({
        success: true,
        url: result.url,
        publicId: result.publicId,
        resourceType: result.resourceType,
        format: result.format,
        bytes: result.bytes,
        originalFilename: result.originalFilename,
      });
    } catch (error) {
      console.error('[uploads/artwork] failed:', error);
      res
        .status(500)
        .json({ success: false, message: error.message || 'Upload failed' });
    }
  },
);

export default router;
