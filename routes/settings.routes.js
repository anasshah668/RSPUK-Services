import express from 'express';
import SiteSetting from '../models/SiteSetting.js';
import GalleryProject from '../models/GalleryProject.js';
import { protect, admin } from '../middleware/auth.js';
import { upload, uploadMultipleToCloudinary } from '../config/cloudinary.js';

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
    if (err) return res.status(400).json({ message: err.message });
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
      uploadedImages = await uploadMultipleToCloudinary(req.files, 'printing-platform/gallery');
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
    if (err) return res.status(400).json({ message: err.message });
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
      uploadedImages = await uploadMultipleToCloudinary(req.files, 'printing-platform/gallery');
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

export default router;

