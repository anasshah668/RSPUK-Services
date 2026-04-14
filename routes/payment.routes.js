import express from "express";
import crypto from "crypto";
import { recordCheckoutOrder } from "../services/checkoutOrdersStore.js";
import { sendPaymentReceiptEmail } from "../services/receiptMail.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import Cart from "../models/Cart.js";

const router = express.Router();

const trim = (value) => String(value ?? "").trim();

const toMinorUnits = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

/**
 * Checkout session → one-time verified token → `/payments/authorizations` with `card/checkout` + `tokenHref`.
 * Authorizations do not accept `sessionHref` alone for this flow.
 */
const toWorldpayCheckoutSessionHref = (sessionInput, apiBase) => {
  let raw = sessionInput;
  if (raw != null && typeof raw === "object") {
    raw = raw.href || raw.sessionHref || raw.sessionState || raw.url || "";
  }
  raw = trim(String(raw || ""));
  if (!raw) return "";
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const inner =
          parsed.href ||
          parsed.sessionHref ||
          parsed.sessionState ||
          parsed.url;
        if (inner) raw = trim(String(inner));
      }
    } catch {
      /* keep raw string */
    }
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = apiBase.replace(/\/+$/, "");
  if (raw.startsWith("/")) return `${base}${raw}`;
  const prefix = trim(
    process.env.WORLDPAY_CHECKOUT_SESSION_PATH_PREFIX ||
      "verifiedTokens/sessions",
  ).replace(/^\/+|\/+$/g, "");
  return `${base}/${prefix}/${raw}`;
};

/** `try` | `live` — also accepts WORLDPAY_MODE. Flip this when you go live; hosts and credentials follow. */
const getWorldpayEnvironmentFlags = () => {
  const environment = trim(
    process.env.WORLDPAY_ENVIRONMENT || process.env.WORLDPAY_MODE || "try",
  ).toLowerCase();
  const isLive = ["live", "prod", "production"].includes(environment);
  return { environment, isLive };
};

/**
 * Active credential set: WORLDPAY_TRY_* / WORLDPAY_LIVE_* per environment, with fallback to plain WORLDPAY_* (single .env).
 */
const getWorldpayProfile = () => {
  const { isLive } = getWorldpayEnvironmentFlags();
  const tag = isLive ? "LIVE" : "TRY";
  const pick = (suffix) =>
    trim(process.env[`WORLDPAY_${tag}_${suffix}`]) ||
    trim(process.env[`WORLDPAY_${suffix}`]);

  const username = pick("USERNAME");
  const password = pick("PASSWORD");
  const serviceKey = pick("SERVICE_KEY");

  return {
    checkoutId: pick("CHECKOUT_ID"),
    username,
    password,
    serviceKey,
    entity: pick("ENTITY") || (!isLive ? "default" : ""),
  };
};

/** Try and Live use different hosts — mixing them with the wrong credentials returns 401 accessDenied. */
const getWorldpayApiBaseUrl = () => {
  const explicit = trim(process.env.WORLDPAY_API_BASE_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  const { isLive } = getWorldpayEnvironmentFlags();
  return isLive
    ? "https://access.worldpay.com"
    : "https://try.access.worldpay.com";
};

/**
 * Basic: username + (password or serviceKey). Bearer: WORLDPAY_AUTH_SCHEME=Bearer and a service key in the active profile.
 */
const getWorldpayAuthHeader = (profile = getWorldpayProfile()) => {
  const scheme = trim(process.env.WORLDPAY_AUTH_SCHEME).toLowerCase();

  if (scheme === "bearer" && profile.serviceKey) {
    return `Bearer ${profile.serviceKey}`;
  }

  const basicPassword = profile.password || profile.serviceKey;
  if (profile.username && basicPassword) {
    const token = Buffer.from(`${profile.username}:${basicPassword}`).toString(
      "base64",
    );
    return `Basic ${token}`;
  }

  return null;
};

/**
 * POST /payments/authorizations = Card Payments API v6 (OpenAPI). v7 moved to /cardPayments/customerInitiatedTransactions.
 * Wrong version on the path returns 415 Bad content type.
 */
const inferCardPaymentsMediaVersion = (authPath) => {
  const path = String(authPath || "");
  if (path.includes("customerInitiatedTransactions")) return "7";
  return "6";
};

/**
 * Use WORLDPAY_AUTH_API=json only for orchestrated URLs (e.g. /api/payments) that accept application/json + WP-Api-Version.
 */
const getWorldpayAuthorizationRequestHeaders = (
  authHeader,
  idempotencyKey,
  authPath,
) => {
  const apiStyle = trim(process.env.WORLDPAY_AUTH_API || "card").toLowerCase();
  if (apiStyle === "json" || apiStyle === "orchestrated") {
    const apiVersion = trim(process.env.WORLDPAY_API_VERSION || "2024-06-01");
    return {
      Authorization: authHeader,
      "Content-Type": "application/json",
      "WP-Api-Version": apiVersion,
      "Idempotency-Key": idempotencyKey,
    };
  }
  let version =
    trim(process.env.WORLDPAY_CARD_PAYMENTS_VERSION) ||
    inferCardPaymentsMediaVersion(authPath);
  const path = String(authPath || "");
  if (path.includes("customerInitiatedTransactions")) {
    if (version === "6") version = "7";
  } else if (version === "7") {
    version = "6";
  }
  const mediaRoot = `application/vnd.worldpay.payments-v${version}`;
  return {
    Authorization: authHeader,
    "Content-Type": `${mediaRoot}+json`,
    Accept: `${mediaRoot}.hal+json`,
    "Idempotency-Key": idempotencyKey,
  };
};

/** Worldpay docs use v3 for POST /verifiedTokens/oneTime; v2 may 415. Override with WORLDPAY_VERIFIED_TOKENS_MEDIA_VERSION=2 if your account still expects v2. */
const getVerifiedTokensMediaVersion = () =>
  trim(process.env.WORLDPAY_VERIFIED_TOKENS_MEDIA_VERSION || "3");

const getVerifiedTokensRequestHeaders = (authHeader, idempotencyKey) => {
  const v = getVerifiedTokensMediaVersion();
  const root = `application/vnd.worldpay.verified-tokens-v${v}`;
  return {
    Authorization: authHeader,
    "Content-Type": `${root}.hal+json`,
    Accept: `${root}.hal+json`,
    "Idempotency-Key": idempotencyKey,
  };
};

/** v3: _embedded.token._links['tokens:token'].href or tokenPaymentInstrument.href; v2: _links['tokens:token'].href */
const extractTokenHrefFromVerifiedTokenResponse = (data) => {
  if (!data || typeof data !== "object") return "";
  const embeddedToken = data._embedded?.token;
  const v3Link =
    embeddedToken?._links?.["tokens:token"]?.href ||
    embeddedToken?.tokenPaymentInstrument?.href;
  if (v3Link) return trim(String(v3Link));
  const v2Link = data._links?.["tokens:token"]?.href;
  return trim(String(v2Link || ""));
};

const extractVerifiedTokenOutcome = (data) => {
  if (!data || typeof data !== "object") return "";
  const fromEmbedded = data._embedded?.verification?.outcome;
  if (fromEmbedded != null && fromEmbedded !== "")
    return String(fromEmbedded).toLowerCase();
  return String(data.outcome || "").toLowerCase();
};

/**
 * Exchange Access Checkout session URL for a one-time token href (Card Payments then needs tokenHref).
 */
const createWorldpayOneTimeVerifiedToken = async ({
  authHeader,
  apiBase,
  entity,
  sessionHref,
  currency,
  cardHolderName,
  paymentInstrumentExtras = {},
}) => {
  const path =
    trim(process.env.WORLDPAY_VERIFIED_TOKENS_PATH) ||
    "/verifiedTokens/oneTime";
  const idempotencyKey = crypto.randomUUID();
  const holder = trim(cardHolderName) || "Customer";
  const vtVersion = getVerifiedTokensMediaVersion();
  const narrativeLine1 = (
    trim(process.env.WORLDPAY_TOKEN_NARRATIVE_LINE1) ||
    trim(process.env.WORLDPAY_STATEMENT_LINE1) ||
    "Card payment"
  ).slice(0, 24);
  const body = {
    description: (
      trim(process.env.WORLDPAY_TOKEN_DESCRIPTION) ||
      "One-time checkout payment"
    ).slice(0, 255),
    paymentInstrument: {
      type: "card/checkout",
      sessionHref,
      cardHolderName: holder,
      ...paymentInstrumentExtras,
    },
    merchant: { entity },
    verificationCurrency: String(currency || "GBP")
      .toUpperCase()
      .slice(0, 3),
  };
  // v3 OpenAPI lists narrative.line1 as required for oneTime; omit on v2 to avoid schema issues
  if (Number(vtVersion) >= 3) {
    body.narrative = { line1: narrativeLine1 };
  }

  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: getVerifiedTokensRequestHeaders(authHeader, idempotencyKey),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(
      data?.message ||
        `Worldpay verified token creation failed (HTTP ${res.status})`,
    );
    err.status = res.status;
    err.details = data;
    throw err;
  }

  const outcome = extractVerifiedTokenOutcome(data);
  if (outcome && outcome !== "verified") {
    const rawOutcome =
      data?._embedded?.verification?.outcome ?? data?.outcome ?? "unknown";
    const err = new Error(
      data?.message || `Card verification did not succeed (${rawOutcome})`,
    );
    err.status = 402;
    err.details = data;
    throw err;
  }

  const tokenHref = extractTokenHrefFromVerifiedTokenResponse(data);
  if (!tokenHref) {
    const err = new Error(
      "Worldpay did not return a token for this card session.",
    );
    err.status = 502;
    err.details = data;
    throw err;
  }

  return tokenHref;
};

// @route   POST /api/payments/worldpay/checkout-session
// @desc    Provide Worldpay checkout configuration for hosted fields
// @access  Public
router.post("/worldpay/checkout-session", async (req, res) => {
  try {
    const { amount, currency = "GBP" } = req.body || {};

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const profile = getWorldpayProfile();
    const authHeader = getWorldpayAuthHeader(profile);
    const checkoutId = profile.checkoutId;
    if (!authHeader) {
      return res.status(500).json({
        message:
          "Worldpay is not configured. Set TRY/LIVE username + password (or SERVICE_KEY) in .env — see README.",
      });
    }
    if (!checkoutId) {
      return res.status(500).json({
        message:
          "Worldpay checkout is not configured. Set WORLDPAY_TRY_CHECKOUT_ID / WORLDPAY_LIVE_CHECKOUT_ID (or WORLDPAY_CHECKOUT_ID).",
      });
    }

    const { isLive } = getWorldpayEnvironmentFlags();

    res.json({
      checkoutId,
      currency,
      amount: Number(amount),
      environment: isLive ? "live" : "try",
      scriptUrl: isLive
        ? "https://access.worldpay.com/access-checkout/v2/checkout.js"
        : "https://try.access.worldpay.com/access-checkout/v2/checkout.js",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: error.message || "Failed to create Worldpay session" });
  }
});

// @route   POST /api/payments/worldpay/charge
// @desc    Authorize payment with Worldpay Access API
// @access  Public
router.post("/worldpay/charge", optionalAuth, async (req, res) => {
  try {
    const {
      sessionState,
      sessionHref: sessionHrefFromBody,
      tokenHref: tokenHrefFromBody,
      amount,
      currency = "GBP",
      orderReference,
      customerInfo = {},
      billingAddress = {},
      orderDetails = {},
    } = req.body || {};

    const sessionInput = sessionHrefFromBody || sessionState;
    if (!sessionInput && !trim(String(tokenHrefFromBody || ""))) {
      return res.status(400).json({
        message:
          "sessionState or sessionHref is required (or pass tokenHref if you already created a verified token).",
      });
    }

    const minorUnits = toMinorUnits(amount);
    if (!minorUnits) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const profile = getWorldpayProfile();
    const authHeader = getWorldpayAuthHeader(profile);
    const apiBase = getWorldpayApiBaseUrl();
    const sessionHref = sessionInput
      ? toWorldpayCheckoutSessionHref(sessionInput, apiBase)
      : "";
    if (sessionInput && !sessionHref) {
      return res.status(400).json({ message: "Invalid checkout session" });
    }

    const authPath =
      trim(process.env.WORLDPAY_AUTHORIZATION_PATH) ||
      "/payments/authorizations";
    const entity = profile.entity;
    const isV7CustomerInitiated = authPath.includes(
      "customerInitiatedTransactions",
    );

    if (!authHeader || !entity) {
      return res.status(500).json({
        message:
          "Worldpay is not configured. Set username, password (or service key), and entity for the active environment (WORLDPAY_TRY_* / WORLDPAY_LIVE_*).",
      });
    }

    const transactionReference = orderReference || `NEON-${Date.now()}`;
    const idempotencyKey = crypto.randomUUID();

    const statementLine1 = (
      trim(process.env.WORLDPAY_STATEMENT_LINE1) || "Card payment"
    ).slice(0, 24);

    const addr1 = trim(
      billingAddress.address1 ||
        billingAddress.street ||
        customerInfo.address ||
        "",
    );
    const city = trim(billingAddress.city || customerInfo.city || "");
    const postalCode = trim(
      billingAddress.postalCode || customerInfo.postalCode || "",
    );
    const cardHolderName = trim(customerInfo.name || "");

    let tokenHref = trim(String(tokenHrefFromBody || ""));
    if (!tokenHref) {
      if (!city || !postalCode) {
        return res.status(400).json({
          message:
            "City and postcode are required for card payment (Worldpay billing address).",
        });
      }
      if (!addr1) {
        return res.status(400).json({
          message: "Street address is required for card payment.",
        });
      }
      const piExtras = {
        billingAddress: {
          address1: addr1,
          city,
          postalCode,
          countryCode: billingAddress.countryCode || "GB",
        },
      };
      try {
        tokenHref = await createWorldpayOneTimeVerifiedToken({
          authHeader,
          apiBase,
          entity,
          sessionHref,
          currency,
          cardHolderName,
          paymentInstrumentExtras: piExtras,
        });
      } catch (e) {
        const status = e.status && Number.isFinite(e.status) ? e.status : 502;
        return res.status(status).json({
          message: e.message || "Worldpay verified token step failed",
          details: e.details,
        });
      }
    }

    const worldpayBody = {
      transactionReference,
      ...(isV7CustomerInitiated ? { channel: "ecom" } : {}),
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
          type: "card/checkout",
          tokenHref,
        },
      },
    };

    if (customerInfo.email) {
      worldpayBody.customer = {
        email: customerInfo.email,
        ...(customerInfo.name
          ? { firstName: String(customerInfo.name).split(/\s+/)[0] }
          : {}),
      };
    }
    if (addr1 || postalCode || city) {
      worldpayBody.billingAddress = {
        ...(addr1 ? { address1: addr1 } : {}),
        ...(postalCode ? { postalCode } : {}),
        ...(city ? { city } : {}),
        countryCode: billingAddress.countryCode || "GB",
      };
    }

    const worldpayResponse = await fetch(`${apiBase}${authPath}`, {
      method: "POST",
      headers: getWorldpayAuthorizationRequestHeaders(
        authHeader,
        idempotencyKey,
        authPath,
      ),
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
        message: data?.message || "Worldpay authorization failed",
        details: data,
      });
    }

    const outcome = String(
      data?.outcome || data?.paymentStatus || "",
    ).toLowerCase();
    const approvedOutcomes = new Set([
      "authorized",
      "sentforsettlement",
      "sent_for_settlement",
      "paid",
      "charged",
    ]);
    if (outcome && !approvedOutcomes.has(outcome)) {
      return res.status(402).json({
        message: data?.message || `Payment was not approved (${outcome})`,
        details: data,
      });
    }

    const worldpayPaymentRef = trim(data?.paymentId || data?.id || "");
    const paymentId =
      worldpayPaymentRef ||
      trim(data?.transactionReference || "") ||
      transactionReference;
    const statusLabel = data?.outcome || data?.paymentStatus || "authorized";

    const persistedRow = {
      source: "worldpay-checkout",
      orderReference: transactionReference,
      paymentId,
      status: statusLabel,
      amount: Number(amount),
      currency,
      userId: req.user?._id ? String(req.user._id) : undefined,
      customer: {
        name: trim(customerInfo.name),
        email: trim(customerInfo.email),
        phone: trim(customerInfo.phone),
        address: addr1,
        city,
        postalCode,
      },
      orderDetails:
        orderDetails && typeof orderDetails === "object" ? orderDetails : {},
      worldpay: {
        outcome: data?.outcome,
        paymentStatus: data?.paymentStatus,
        id: data?.id,
      },
    };

    let savedOrderRow = null;
    try {
      savedOrderRow = await recordCheckoutOrder(persistedRow);
    } catch (persistErr) {
      console.error(
        "[worldpay/charge] Failed to persist checkout order",
        persistErr,
      );
    }

    const customerEmail = trim(customerInfo.email);
    let receiptEmailSent = false;
    let receiptEmailReason = null;
    if (!customerEmail) {
      receiptEmailReason = "no_customer_email";
    } else {
      try {
        const summaryLines = Array.isArray(orderDetails?.summary)
          ? orderDetails.summary.map((row) => ({
              label: String(row?.label ?? ""),
              value: String(row?.value ?? ""),
            }))
          : [];
        const mailResult = await sendPaymentReceiptEmail({
          to: customerEmail,
          orderReference: transactionReference,
          paymentId,
          amount: Number(amount),
          currency,
          customerName: trim(customerInfo.name) || "Customer",
          customerEmail,
          phone: trim(customerInfo.phone),
          addressLines: [
            addr1,
            [city, postalCode].filter(Boolean).join(", "),
          ].filter(Boolean),
          orderTitle: trim(orderDetails?.title),
          orderDescription: trim(orderDetails?.description),
          trackingId: trim(savedOrderRow?.trackingId),
          summaryLines,
        });
        receiptEmailSent = Boolean(mailResult?.sent);
        if (!receiptEmailSent) {
          receiptEmailReason = mailResult?.reason || "not_sent";
        }
      } catch (mailErr) {
        console.error("[worldpay/charge] Receipt email failed", mailErr);
        receiptEmailReason = "send_failed";
      }
    }

    try {
      if (req.user?._id) {
        await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });
      } else {
        const guestClientId = trim(req.headers["x-client-id"]);
        if (guestClientId.length >= 8) {
          await Cart.updateOne(
            { guestClientId },
            { $set: { items: [] } },
          );
        }
      }
    } catch (cartErr) {
      console.error("[worldpay/charge] Failed to clear basket", cartErr);
    }

    res.json({
      success: true,
      provider: "worldpay",
      status: statusLabel,
      paymentId,
      orderReference: transactionReference,
      trackingId: trim(savedOrderRow?.trackingId) || null,
      amount: Number(amount),
      currency,
      worldpay: data,
      receiptEmailSent,
      receiptEmailReason,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Worldpay charge failed",
      details: {
        errorName: error.name || "Error",
        ...(process.env.NODE_ENV !== "production" && error.stack
          ? { stack: error.stack }
          : {}),
      },
    });
  }
});

export default router;
