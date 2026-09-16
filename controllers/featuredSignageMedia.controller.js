import FeaturedSignageMedia from '../models/FeaturedSignageMedia.js';
import { persistImageRecord, uploadMultipleToS3, withReadableUrls } from '../config/s3.js';

const normalizeSlug = (slug) => String(slug || '').trim().toLowerCase();

const normalizeImages = (images) =>
  (Array.isArray(images) ? images : []).map(persistImageRecord).filter(Boolean);

export const listFeaturedSignageMediaPublic = async (_req, res) => {
  try {
    const rows = await FeaturedSignageMedia.find({}).sort({ categorySlug: 1 }).lean();
    const items = await Promise.all(
      rows.map(async (row) => {
        const imageObjects = await withReadableUrls(row.images);
        return {
          categorySlug: row.categorySlug,
          images: imageObjects.map((img) => img.url),
          imageObjects,
        };
      }),
    );
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load featured media' });
  }
};

export const getFeaturedSignageMediaPublic = async (req, res) => {
  try {
    const categorySlug = normalizeSlug(req.params.categorySlug);
    if (!categorySlug) {
      return res.status(400).json({ message: 'categorySlug is required' });
    }
    const row = await FeaturedSignageMedia.findOne({ categorySlug }).lean();
    if (!row) {
      return res.json({ categorySlug, images: [], imageObjects: [] });
    }
    const imageObjects = await withReadableUrls(row.images);
    res.json({
      categorySlug,
      images: imageObjects.map((img) => img.url),
      imageObjects,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load featured media' });
  }
};

export const listFeaturedSignageMediaAdmin = async (_req, res) => {
  try {
    const rows = await FeaturedSignageMedia.find({}).sort({ categorySlug: 1 }).lean();
    const items = await Promise.all(
      rows.map(async (row) => ({
        categorySlug: row.categorySlug,
        images: await withReadableUrls(row.images),
        updatedAt: row.updatedAt,
      })),
    );
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load featured media' });
  }
};

export const getFeaturedSignageMediaAdmin = async (req, res) => {
  try {
    const categorySlug = normalizeSlug(req.params.categorySlug);
    if (!categorySlug) {
      return res.status(400).json({ message: 'categorySlug is required' });
    }
    const row = await FeaturedSignageMedia.findOne({ categorySlug }).lean();
    res.json({
      categorySlug,
      images: await withReadableUrls(row?.images),
      updatedAt: row?.updatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load featured media' });
  }
};

export const updateFeaturedSignageMediaAdmin = async (req, res) => {
  try {
    const categorySlug = normalizeSlug(req.params.categorySlug);
    if (!categorySlug) {
      return res.status(400).json({ message: 'categorySlug is required' });
    }

    let existingImages = [];
    const existingImagesRaw = req.body?.existingImages;
    if (existingImagesRaw !== undefined) {
      try {
        const parsed =
          typeof existingImagesRaw === 'string'
            ? JSON.parse(existingImagesRaw)
            : existingImagesRaw;
        existingImages = normalizeImages(parsed);
      } catch {
        existingImages = [];
      }
    } else {
      const current = await FeaturedSignageMedia.findOne({ categorySlug }).lean();
      existingImages = normalizeImages(current?.images);
    }

    let uploadedImages = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      uploadedImages = await uploadMultipleToS3(
        req.files,
        'printing-platform/featured-signage',
      );
    } else {
      uploadedImages = normalizeImages(req.body?.uploadedImages);
    }

    const mergedImages = normalizeImages([...existingImages, ...uploadedImages]);
    if (mergedImages.length === 0) {
      return res.status(400).json({
        message: 'Add at least one image. If you did, the files never reached the server — try again or upload fewer/smaller pictures.',
      });
    }

    const row = await FeaturedSignageMedia.findOneAndUpdate(
      { categorySlug },
      { categorySlug, images: mergedImages },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    res.json({
      categorySlug: row.categorySlug,
      images: await withReadableUrls(row.images),
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to save featured media' });
  }
};

export const deleteFeaturedSignageMediaAdmin = async (req, res) => {
  try {
    const categorySlug = normalizeSlug(req.params.categorySlug);
    if (!categorySlug) {
      return res.status(400).json({ message: 'categorySlug is required' });
    }
    await FeaturedSignageMedia.findOneAndDelete({ categorySlug });
    res.json({ categorySlug, images: [], cleared: true });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to clear featured media' });
  }
};
