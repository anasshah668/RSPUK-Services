import express from 'express';
import { calculateNeonPricePublic } from '../controllers/neonPricing.controller.js';

const router = express.Router();

router.post('/calculate', calculateNeonPricePublic);

export default router;
