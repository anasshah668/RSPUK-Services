import { body, validationResult } from "express-validator";
import { hasDangerousKeys, safeEmail, safePassword } from "../utils/safeAuthInput.js";

function validationFailed(res, errors) {
  return res.status(400).json({
    message: errors[0]?.msg || "Invalid request",
    errors: errors.map((e) => ({ field: e.path, message: e.msg })),
  });
}

export const rejectDangerousAuthBody = (req, res, next) => {
  if (hasDangerousKeys(req.body)) {
    return res.status(400).json({ message: "Invalid request payload" });
  }
  next();
};

export const loginValidators = [
  body("email")
    .custom((value) => safeEmail(value) != null)
    .withMessage("Please provide a valid email address"),
  body("password")
    .custom((value) => safePassword(value) != null)
    .withMessage("Password must be between 6 and 128 characters"),
];

export function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationFailed(res, errors.array());
  }
  next();
}

export function attachSafeCredentials(req, _res, next) {
  const email = safeEmail(req.body?.email);
  const password = safePassword(req.body?.password);
  if (!email || !password) {
    return res.status(400).json({ message: "Invalid email or password format" });
  }
  req.safeAuth = { email, password };
  next();
}
