const EMAIL_MAX_LEN = 254;
const PASSWORD_MIN_LEN = 6;
const PASSWORD_MAX_LEN = 128;

const DANGEROUS_VALUE_PATTERN = /[\$\{\}\[\]]/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reject NoSQL-style operator keys on auth payloads. */
export function hasDangerousKeys(value, depth = 0) {
  if (depth > 4) return true;
  if (value == null) return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousKeys(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => {
    if (key.startsWith("$") || key.includes(".")) return true;
    return hasDangerousKeys(nested, depth + 1);
  });
}

export function safeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().slice(0, EMAIL_MAX_LEN);
  if (!normalized || DANGEROUS_VALUE_PATTERN.test(normalized)) return null;
  if (!EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

export function safePassword(value) {
  if (typeof value !== "string") return null;
  if (value.length < PASSWORD_MIN_LEN || value.length > PASSWORD_MAX_LEN) return null;
  return value;
}

export function parseAuthCredentials(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { email: null, password: null, invalid: true };
  }
  if (hasDangerousKeys(body)) {
    return { email: null, password: null, invalid: true };
  }
  return {
    email: safeEmail(body.email),
    password: safePassword(body.password),
    invalid: false,
  };
}
