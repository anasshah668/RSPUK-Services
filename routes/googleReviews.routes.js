import express from 'express';
import {
  fetchGoogleReviews,
  getGoogleReviewsFallback,
} from '../services/googleReviewsService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const data = await fetchGoogleReviews();
    return res.json(data);
  } catch (err) {
    const code = err.code || 'GOOGLE_REVIEWS_ERROR';
    const status =
      code === 'GOOGLE_REVIEWS_NOT_CONFIGURED'
        ? 503
        : code === 'GOOGLE_PLACE_NOT_FOUND'
          ? 404
          : 502;

    return res.status(status).json({
      ok: false,
      error: err.message,
      code,
      ...getGoogleReviewsFallback(),
    });
  }
});

export default router;
