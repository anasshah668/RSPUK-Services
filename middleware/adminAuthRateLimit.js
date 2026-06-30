const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;
const LOCK_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** @type {Map<string, { count: number, windowStart: number, lockedUntil: number }>} */
const buckets = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function bucketKey(req) {
  return `admin-auth:${clientIp(req)}`;
}

function cleanupStaleBuckets() {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    const windowExpired = now - entry.windowStart > WINDOW_MS * 2;
    const lockExpired = entry.lockedUntil > 0 && entry.lockedUntil <= now;
    if (windowExpired && lockExpired) {
      buckets.delete(key);
    }
  }
}

setInterval(cleanupStaleBuckets, CLEANUP_INTERVAL_MS).unref?.();

function sendLocked(res, lockedUntil, now) {
  const retryAfterSec = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  res.set("Retry-After", String(retryAfterSec));
  return res.status(429).json({
    message: `Too many attempts. Please wait ${Math.ceil(retryAfterSec / 60)} minute(s) before trying again.`,
    retryAfterSeconds: retryAfterSec,
  });
}

/**
 * Admin auth rate limit: 20 requests/minute per IP, then 10-minute lockout.
 */
export function adminAuthRateLimit(req, res, next) {
  const key = bucketKey(req);
  const now = Date.now();
  let entry = buckets.get(key);

  if (!entry) {
    entry = { count: 0, windowStart: now, lockedUntil: 0 };
    buckets.set(key, entry);
  }

  if (entry.lockedUntil > now) {
    return sendLocked(res, entry.lockedUntil, now);
  }

  if (now - entry.windowStart >= WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    entry.lockedUntil = now + LOCK_MS;
    return sendLocked(res, entry.lockedUntil, now);
  }

  next();
}

/** Rate limit only when forgot-password is requested for admin accounts. */
export function adminAuthRateLimitIfAdminContext(req, res, next) {
  if (req.body?.context === "admin") {
    return adminAuthRateLimit(req, res, next);
  }
  return next();
}

/** @internal test helper */
export function resetAdminAuthRateLimitForTests() {
  buckets.clear();
}
