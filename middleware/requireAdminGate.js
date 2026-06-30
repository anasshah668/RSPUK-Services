import { verifyAdminGateToken } from "../utils/adminGateToken.js";

function readGateToken(req) {
  const header = req.headers["x-admin-gate-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (typeof req.body?.gateToken === "string" && req.body.gateToken.trim()) {
    return req.body.gateToken.trim();
  }
  return null;
}

export function requireAdminGate(req, res, next) {
  const token = readGateToken(req);
  if (!verifyAdminGateToken(token)) {
    return res.status(403).json({
      message: "Admin access code required. Enter the access code to continue.",
      code: "ADMIN_GATE_REQUIRED",
    });
  }
  next();
}

export function requireAdminGateForAdminContext(req, res, next) {
  if (req.body?.context === "admin") {
    return requireAdminGate(req, res, next);
  }
  return next();
}
