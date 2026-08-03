import express from 'express';
import {
  listFeaturedSignageMediaPublic,
  getFeaturedSignageMediaPublic,
} from '../controllers/featuredSignageMedia.controller.js';

const router = express.Router();

router.get('/', listFeaturedSignageMediaPublic);
router.get('/:categorySlug', getFeaturedSignageMediaPublic);

export default router;
