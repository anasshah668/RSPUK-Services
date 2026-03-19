import express from 'express';
import SiteSetting from '../models/SiteSetting.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

const TOP_ANNOUNCEMENT_KEY = 'topAnnouncement';

const defaultAnnouncement = {
  enabled: true,
  prefix: 'Top Announcement',
  message: 'Price Promise | UK wide delivery',
};

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

export default router;

