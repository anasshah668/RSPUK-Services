import express from 'express';
import SiteSetting from '../models/SiteSetting.js';
import GalleryProject from '../models/GalleryProject.js';
import Faq from '../models/Faq.js';
import { protect, admin } from '../middleware/auth.js';
import { upload, uploadMultipleToS3 } from '../config/s3.js';
import {
  getDesignServicePrice,
  saveDesignServicePrice,
} from '../services/designServicePrice.js';

const router = express.Router();

const TOP_ANNOUNCEMENT_KEY = 'topAnnouncement';

const defaultAnnouncement = {
  enabled: true,
  prefix: 'Top Announcement',
  message: 'Price Promise | UK wide delivery',
};

const normalizeGalleryProjectPayload = (body = {}) => ({
  title: String(body.title || '').trim(),
  description: String(body.description || '').trim(),
  isActive: body.isActive === undefined
    ? true
    : (body.isActive === true || body.isActive === 'true'),
  displayOrder: Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
});

const normalizeFaqPayload = (body = {}) => ({
  question: String(body.question || '').trim(),
  answer: String(body.answer || '').trim(),
  isActive: body.isActive === undefined
    ? true
    : (body.isActive === true || body.isActive === 'true'),
  displayOrder: Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
});

// Public: read top announcement
router.get('/top-announcement', async (req, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: TOP_ANNOUNCEMENT_KEY });
    res.json(setting?.value || defaultAnnouncement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: upsert top announcement
router.put('/top-announcement', protect, admin, async (req, res) => {
  try {
    const payload = {
      enabled: req.body.enabled !== undefined ? Boolean(req.body.enabled) : true,
      prefix: String(req.body.prefix || 'Top Announcement').trim(),
      message: String(req.body.message || '').trim(),
    };

    const setting = await SiteSetting.findOneAndUpdate(
      { key: TOP_ANNOUNCEMENT_KEY },
      { key: TOP_ANNOUNCEMENT_KEY, value: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(setting.value);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Public: read design service price
router.get('/design-service-price', async (req, res) => {
  try {
    const pricing = await getDesignServicePrice();
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: update design service price
router.put('/design-service-price', protect, admin, async (req, res) => {
  try {
    const saved = await saveDesignServicePrice({
      price: req.body?.price,
      vatInclusive: req.body?.vatInclusive,
    });
    res.json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to save design service price' });
  }
});

// Public: list active gallery projects
router.get('/gallery-projects', async (req, res) => {
  try {
    const projects = await GalleryProject.find({ isActive: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: list all gallery projects
router.get('/gallery-projects/admin', protect, admin, async (req, res) => {
  try {
    const projects = await GalleryProject.find({})
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: create gallery project
router.post('/gallery-projects', protect, admin, (req, res, next) => {
  upload.array('images', 20)(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Each picture must be under 8 MB. Compress it or upload one at a time.'
            : err.message || 'Upload failed',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const payload = normalizeGalleryProjectPayload(req.body);
    if (!payload.title) {
      return res.status(400).json({ message: 'Project title is required' });
    }

    let uploadedImages = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      uploadedImages = await uploadMultipleToS3(req.files, 'printing-platform/gallery');
    }
    if (!uploadedImages.length) {
      return res.status(400).json({ message: 'At least one gallery image is required' });
    }

    const project = await GalleryProject.create({
      ...payload,
      images: uploadedImages,
    });
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: update gallery project
router.put('/gallery-projects/:id', protect, admin, (req, res, next) => {
  upload.array('images', 20)(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Each picture must be under 8 MB. Compress it or upload one at a time.'
            : err.message || 'Upload failed',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const project = await GalleryProject.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Gallery project not found' });

    const payload = normalizeGalleryProjectPayload(req.body);
    if (!payload.title) {
      return res.status(400).json({ message: 'Project title is required' });
    }

    const existingImagesRaw = req.body.existingImages;
    let existingImages = project.images;
    if (existingImagesRaw !== undefined) {
      try {
        const parsed = typeof existingImagesRaw === 'string'
          ? JSON.parse(existingImagesRaw)
          : existingImagesRaw;
        existingImages = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        existingImages = project.images;
      }
    }

    let uploadedImages = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      uploadedImages = await uploadMultipleToS3(req.files, 'printing-platform/gallery');
    }

    const mergedImages = [...existingImages, ...uploadedImages]
      .map((img) => ({ url: String(img?.url || '').trim(), publicId: String(img?.publicId || '').trim() }))
      .filter((img) => img.url);

    if (!mergedImages.length) {
      return res.status(400).json({ message: 'At least one gallery image is required' });
    }

    project.title = payload.title;
    project.description = payload.description;
    project.isActive = payload.isActive;
    project.displayOrder = payload.displayOrder;
    project.images = mergedImages;
    await project.save();

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: delete gallery project
router.delete('/gallery-projects/:id', protect, admin, async (req, res) => {
  try {
    const project = await GalleryProject.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Gallery project not found' });
    await project.deleteOne();
    res.json({ message: 'Gallery project deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Public: list active FAQs
router.get('/faqs', async (req, res) => {
  try {
    const faqs = await Faq.find({ isActive: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({ faqs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: list all FAQs
router.get('/faqs/admin', protect, admin, async (req, res) => {
  try {
    const faqs = await Faq.find({})
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({ faqs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: create FAQ
router.post('/faqs', protect, admin, async (req, res) => {
  try {
    const payload = normalizeFaqPayload(req.body);
    if (!payload.question) {
      return res.status(400).json({ message: 'Question is required' });
    }
    if (!payload.answer) {
      return res.status(400).json({ message: 'Answer is required' });
    }

    const faq = await Faq.create(payload);
    res.status(201).json(faq);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: update FAQ
router.put('/faqs/:id', protect, admin, async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });

    const payload = normalizeFaqPayload(req.body);
    if (!payload.question) {
      return res.status(400).json({ message: 'Question is required' });
    }
    if (!payload.answer) {
      return res.status(400).json({ message: 'Answer is required' });
    }

    faq.question = payload.question;
    faq.answer = payload.answer;
    faq.isActive = payload.isActive;
    faq.displayOrder = payload.displayOrder;
    await faq.save();

    res.json(faq);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: delete FAQ
router.delete('/faqs/:id', protect, admin, async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });
    await faq.deleteOne();
    res.json({ message: 'FAQ deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

