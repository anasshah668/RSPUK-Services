import express from 'express';
import { calculateFeaturedSignagePricePublic } from '../controllers/featuredSignagePricing.controller.js';

const router = express.Router();

router.post('/calculate', calculateFeaturedSignagePricePublic);

export default router;
