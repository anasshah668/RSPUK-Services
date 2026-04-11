import express from 'express';
import crypto from 'crypto';

const router = express.Router();

const trim = (value) => String(value ?? '').trim();

const toMinorUnits = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

/** `try` | `live` — also accepts WORLDPAY_MODE. Flip this when you go live; hosts and credentials follow. */
const getWorldpayEnvironmentFlags = () => {
  const environment = trim(process.env.WORLDPAY_ENVIRONMENT || process.env.WORLDPAY_MODE || 'try').toLowerCase();
  const isLive = ['live', 'prod', 'production'].includes(environment);
  return { environment, isLive };
};

/**
 * Active credential set: WORLDPAY_TRY_* / WORLDPAY_LIVE_* per environment, with fallback to plain WORLDPAY_* (single .env).
 */
const getWorldpayProfile = () => {
  const { isLive } = getWorldpayEnvironmentFlags();
  const tag = isLive ? 'LIVE' : 'TRY';
  const pick = (suffix) => trim(process.env[`WORLDPAY_${tag}_${suffix}`]) || trim(process.env[`WORLDPAY_${suffix}`]);

  const username = pick('USERNAME');
  const password = pick('PASSWORD');
  const serviceKey = pick('SERVICE_KEY');

  return {
    checkoutId: pick('CHECKOUT_ID'),
    username,
    password,
    serviceKey,
    entity: pick('ENTITY') || (!isLive ? 'default' : ''),
  };
};

/** Try and Live use different hosts — mixing them with the wrong credentials returns 401 accessDenied. */
const getWorldpayApiBaseUrl = () => {
  const explicit = trim(process.env.WORLDPAY_API_BASE_URL);
  if (explicit) return explicit.replace(/\/+$/, '');
  const { isLive } = getWorldpayEnvironmentFlags();
  return isLive ? 'https://access.worldpay.com' : 'https://try.access.worldpay.com';
};

/**
 * Basic: username + (password or serviceKey). Bearer: WORLDPAY_AUTH_SCHEME=Bearer and a service key in the active profile.
 */
const getWorldpayAuthHeader = (profile = getWorldpayProfile()) => {
  const scheme = trim(process.env.WORLDPAY_AUTH_SCHEME).toLowerCase();

  if (scheme === 'bearer' && profile.serviceKey) {
    return `Bearer ${profile.serviceKey}`;
  }

  const basicPassword = profile.password || profile.serviceKey;
  if (profile.username && basicPassword) {
    const token = Buffer.from(`${profile.username}:${basicPassword}`).toString('base64');
    return `Basic ${token}`;
  }

  return null;
};

/**
 * POST /payments/authorizations is the Card Payments API — it expects vendor media types, not application/json.
 * Use WORLDPAY_AUTH_API=json only if you point WORLDPAY_AUTHORIZATION_PATH at an orchestrated route that accepts JSON + WP-Api-Version.
 */
const getWorldpayAuthorizationRequestHeaders = (authHeader, idempotencyKey) => {
  const apiStyle = trim(process.env.WORLDPAY_AUTH_API || 'card').toLowerCase();
  if (apiStyle === 'json' || apiStyle === 'orchestrated') {
    const apiVersion = trim(process.env.WORLDPAY_API_VERSION || '2024-06-01');
    return {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      'WP-Api-Version': apiVersion,
      'Idempotency-Key': idempotencyKey,
    };
  }
  const version = trim(process.env.WORLDPAY_CARD_PAYMENTS_VERSION || '7');
  const mediaRoot = `application/vnd.worldpay.payments-v${version}`;
  return {
    Authorization: authHeader,
    'Content-Type': `${mediaRoot}+json`,
    Accept: `${mediaRoot}.hal+json`,
    'Idempotency-Key': idempotencyKey,
  };
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

    const profile = getWorldpayProfile();
    const authHeader = getWorldpayAuthHeader(profile);
    const checkoutId = profile.checkoutId;
    if (!authHeader) {
      return res.status(500).json({
        message:
          'Worldpay is not configured. Set TRY/LIVE username + password (or SERVICE_KEY) in .env — see README.',
      });
    }
    if (!checkoutId) {
      return res.status(500).json({
        message: 'Worldpay checkout is not configured. Set WORLDPAY_TRY_CHECKOUT_ID / WORLDPAY_LIVE_CHECKOUT_ID (or WORLDPAY_CHECKOUT_ID).',
      });
    }

    const { isLive } = getWorldpayEnvironmentFlags();

    res.json({
      checkoutId,
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

    const profile = getWorldpayProfile();
    const authHeader = getWorldpayAuthHeader(profile);
    const apiBase = getWorldpayApiBaseUrl();
    const authPath = process.env.WORLDPAY_AUTHORIZATION_PATH || '/payments/authorizations';
    const entity = profile.entity;

    if (!authHeader || !entity) {
      return res.status(500).json({
        message:
          'Worldpay is not configured. Set username, password (or service key), and entity for the active environment (WORLDPAY_TRY_* / WORLDPAY_LIVE_*).',
      });
    }

    const transactionReference = orderReference || `NEON-${Date.now()}`;
    const idempotencyKey = crypto.randomUUID();

    const statementLine1 = (trim(process.env.WORLDPAY_STATEMENT_LINE1) || 'Card payment').slice(0, 24);

    const addr1 = billingAddress.address1 || billingAddress.street || customerInfo.address;
    const worldpayBody = {
      transactionReference,
      channel: 'ecom',
      merchant: { entity },
      instruction: {
        narrative: {
          line1: statementLine1,
        },
        value: {
          currency,
          amount: minorUnits,
        },
        paymentInstrument: {
          type: 'card/front',
          sessionState,
        },
      },
    };

    if (customerInfo.email) {
      worldpayBody.customer = {
        email: customerInfo.email,
        ...(customerInfo.name ? { firstName: String(customerInfo.name).split(/\s+/)[0] } : {}),
      };
    }
    if (addr1 || billingAddress.postalCode || billingAddress.city) {
      worldpayBody.billingAddress = {
        ...(addr1 ? { address1: addr1 } : {}),
        ...(billingAddress.postalCode ? { postalCode: billingAddress.postalCode } : {}),
        ...(billingAddress.city ? { city: billingAddress.city } : {}),
        countryCode: billingAddress.countryCode || 'GB',
      };
    }

    const worldpayResponse = await fetch(`${apiBase}${authPath}`, {
      method: 'POST',
      headers: getWorldpayAuthorizationRequestHeaders(authHeader, idempotencyKey),
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
