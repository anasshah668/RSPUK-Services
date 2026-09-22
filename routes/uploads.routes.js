import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  artworkUpload,
  ensureS3BrowserCors,
  isAllowedStoredKey,
  streamStoredObject,
  uploadArtworkToS3,
} from '../config/s3.js';

const router = express.Router();

ensureS3BrowserCors();

const pipeS3Body = async (body, res) => {
  if (body?.pipe) {
    body.pipe(res);
    return;
  }
  const bytes = await body.transformToByteArray();
  res.send(Buffer.from(bytes));
};

// @route   GET /api/uploads/file
// @desc    Stream an S3 artwork/media file through the API so riversigns.co.uk
//          can preview PDFs without depending on bucket CORS.
// @access  Public (only printing-platform/* keys)
router.get('/file', async (req, res) => {
  try {
    const fileUrl = String(req.query.url || req.query.key || '').trim();
    if (!fileUrl || !isAllowedStoredKey(fileUrl)) {
      return res.status(400).json({ message: 'Invalid file URL' });
    }

    const object = await streamStoredObject(fileUrl, { range: req.headers.range });
    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
    if (object.ContentRange) {
      res.setHeader('Content-Range', object.ContentRange);
      res.status(206);
    } else {
      res.status(200);
    }
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Accept-Ranges', 'bytes');
    await pipeS3Body(object.Body, res);
  } catch (error) {
    const status = error?.status || error?.$metadata?.httpStatusCode || 500;
    if (!res.headersSent) {
      res.status(status).json({
        message: status === 404 ? 'File not found' : error.message || 'Could not load file',
      });
    }
  }
});

// @route   POST /api/uploads/artwork
// @desc    Upload a single artwork file (image or PDF) to S3
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

      const result = await uploadArtworkToS3(
        req.file.buffer,
        req.file.originalname,
        'printing-platform/artwork',
        req.file.mimetype,
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
