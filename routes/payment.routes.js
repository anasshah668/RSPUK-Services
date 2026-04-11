import express from 'express';
import crypto from 'crypto';

const router = express.Router();

const trim = (value) => String(value ?? '').trim();

const toMinorUnits = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

/**
 * Card Payments `/payments/authorizations` expects `card/checkout` + `sessionHref`.
 * SDK often returns a full URL; sometimes a path or token — see WORLDPAY_CHECKOUT_SESSION_PATH_PREFIX (default verifiedTokens/sessions per Worldpay docs).
 */
const toWorldpayCheckoutSessionHref = (sessionInput, apiBase) => {
  let raw = sessionInput;
  if (raw != null && typeof raw === 'object') {
    raw = raw.href || raw.sessionHref || raw.sessionState || raw.url || '';
  }
  raw = trim(String(raw || ''));
  if (!raw) return '';
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const inner = parsed.href || parsed.sessionHref || parsed.sessionState || parsed.url;
        if (inner) raw = trim(String(inner));
      }
    } catch {
      /* keep raw string */
    }
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = apiBase.replace(/\/+$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  const prefix = trim(process.env.WORLDPAY_CHECKOUT_SESSION_PATH_PREFIX || 'verifiedTokens/sessions').replace(/^\/+|\/+$/g, '');
  return `${base}/${prefix}/${raw}`;
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
 * POST /payments/authorizations = Card Payments API v6 (OpenAPI). v7 moved to /cardPayments/customerInitiatedTransactions.
 * Wrong version on the path returns 415 Bad content type.
 */
const inferCardPaymentsMediaVersion = (authPath) => {
  const path = String(authPath || '');
  if (path.includes('customerInitiatedTransactions')) return '7';
  return '6';
};

/**
 * Use WORLDPAY_AUTH_API=json only for orchestrated URLs (e.g. /api/payments) that accept application/json + WP-Api-Version.
 */
const getWorldpayAuthorizationRequestHeaders = (authHeader, idempotencyKey, authPath) => {
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
  let version = trim(process.env.WORLDPAY_CARD_PAYMENTS_VERSION) || inferCardPaymentsMediaVersion(authPath);
  const path = String(authPath || '');
  if (path.includes('customerInitiatedTransactions')) {
    if (version === '6') version = '7';
  } else if (version === '7') {
    version = '6';
  }
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
      sessionHref: sessionHrefFromBody,
      amount,
      currency = 'GBP',
      orderReference,
      customerInfo = {},
      billingAddress = {},
    } = req.body || {};

    const sessionInput = sessionHrefFromBody || sessionState;
    if (!sessionInput) {
      return res.status(400).json({ message: 'sessionState or sessionHref is required' });
    }

    const minorUnits = toMinorUnits(amount);
    if (!minorUnits) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const profile = getWorldpayProfile();
    const authHeader = getWorldpayAuthHeader(profile);
    const apiBase = getWorldpayApiBaseUrl();
    const sessionHref = toWorldpayCheckoutSessionHref(sessionInput, apiBase);
    if (!sessionHref) {
      return res.status(400).json({ message: 'Invalid checkout session' });
    }

    const authPath = trim(process.env.WORLDPAY_AUTHORIZATION_PATH) || '/payments/authorizations';
    const entity = profile.entity;
    const isV7CustomerInitiated = authPath.includes('customerInitiatedTransactions');

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
    const cardHolderName = trim(customerInfo.name || '');
    const worldpayBody = {
      transactionReference,
      ...(isV7CustomerInitiated ? { channel: 'ecom' } : {}),
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
          type: 'card/checkout',
          sessionHref,
          ...(cardHolderName ? { cardHolderName } : {}),
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
      headers: getWorldpayAuthorizationRequestHeaders(authHeader, idempotencyKey, authPath),
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
