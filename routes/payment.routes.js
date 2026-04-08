import express from 'express';
import crypto from 'crypto';

const router = express.Router();

const toMinorUnits = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

const getWorldpayAuthHeader = () => {
  const username = process.env.WORLDPAY_USERNAME;
  const password = process.env.WORLDPAY_PASSWORD;
  if (!username || !password) return null;
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${token}`;
};

// @route   POST /api/payments/worldpay/checkout-session
// @desc    Provide Worldpay checkout configuration for hosted fields
// @access  Public
router.post('/worldpay/checkout-session', async (req, res) => {
  try {
    const { amount, currency = 'GBP' } = req.body || {};

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const authHeader = getWorldpayAuthHeader();
    if (!authHeader) {
      return res.status(500).json({
        message: 'Worldpay is not configured. Set WORLDPAY_USERNAME and WORLDPAY_PASSWORD.',
      });
    }

    const environment = String(process.env.WORLDPAY_ENVIRONMENT || 'try').toLowerCase();
    const isLive = ['live', 'prod', 'production'].includes(environment);

    res.json({
      currency,
      amount: Number(amount),
      environment: isLive ? 'live' : 'try',
      scriptUrl: isLive
        ? 'https://access.worldpay.com/access-checkout/v2/checkout.js'
        : 'https://try.access.worldpay.com/access-checkout/v2/checkout.js',
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to create Worldpay session' });
  }
});

// @route   POST /api/payments/worldpay/charge
// @desc    Authorize payment with Worldpay Access API
// @access  Public
router.post('/worldpay/charge', async (req, res) => {
  try {
    const {
      sessionState,
      amount,
      currency = 'GBP',
      orderReference,
      customerInfo = {},
      billingAddress = {},
    } = req.body || {};

    if (!sessionState) {
      return res.status(400).json({ message: 'sessionState is required' });
    }

    const minorUnits = toMinorUnits(amount);
    if (!minorUnits) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const authHeader = getWorldpayAuthHeader();
    const apiBase = (process.env.WORLDPAY_API_BASE_URL || 'https://access.worldpay.com').replace(/\/+$/, '');
    const authPath = process.env.WORLDPAY_AUTHORIZATION_PATH || '/payments/authorizations';
    const apiVersion = process.env.WORLDPAY_API_VERSION || '2024-06-01';
    const entity = process.env.WORLDPAY_ENTITY;

    if (!authHeader || !entity) {
      return res.status(500).json({
        message: 'Worldpay is not configured. Set WORLDPAY_USERNAME, WORLDPAY_PASSWORD and WORLDPAY_ENTITY.',
      });
    }

    const transactionReference = orderReference || `NEON-${Date.now()}`;
    const idempotencyKey = crypto.randomUUID();

    const worldpayBody = {
      transactionReference,
      merchant: { entity },
      instruction: {
        value: minorUnits,
        currency,
      },
      paymentInstrument: {
        type: 'card/front',
        sessionState,
      },
      customer: {
        email: customerInfo.email || undefined,
        firstName: customerInfo.name || undefined,
      },
      billingAddress: {
        address1: billingAddress.address1 || billingAddress.street || customerInfo.address || undefined,
        postalCode: billingAddress.postalCode || undefined,
        city: billingAddress.city || undefined,
        countryCode: billingAddress.countryCode || 'GB',
      },
    };

    const worldpayResponse = await fetch(`${apiBase}${authPath}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'WP-Api-Version': apiVersion,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(worldpayBody),
    });

    const raw = await worldpayResponse.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (error) {
      data = { raw };
    }

    if (!worldpayResponse.ok) {
      return res.status(worldpayResponse.status).json({
        message: data?.message || 'Worldpay authorization failed',
        details: data,
      });
    }

    const outcome = String(data?.outcome || data?.paymentStatus || '').toLowerCase();
    const approvedOutcomes = new Set(['authorized', 'sentforsettlement', 'sent_for_settlement', 'paid', 'charged']);
    if (outcome && !approvedOutcomes.has(outcome)) {
      return res.status(402).json({
        message: data?.message || `Payment was not approved (${outcome})`,
        details: data,
      });
    }

    res.json({
      success: true,
      provider: 'worldpay',
      status: data?.outcome || data?.paymentStatus || 'authorized',
      paymentId: data?.transactionReference || data?.id || transactionReference,
      orderReference: transactionReference,
      amount: Number(amount),
      currency,
      worldpay: data,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Worldpay charge failed' });
  }
});

export default router;
