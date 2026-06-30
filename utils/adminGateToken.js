import jwt from "jsonwebtoken";

const GATE_PURPOSE = "admin_gate";
const GATE_TTL = "30m";

export function signAdminGateToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign({ purpose: GATE_PURPOSE }, secret, { expiresIn: GATE_TTL });
}

export function verifyAdminGateToken(token) {
  if (!token || typeof token !== "string") return false;
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    const decoded = jwt.verify(token, secret);
    return decoded?.purpose === GATE_PURPOSE;
  } catch {
    return false;
  }
}
