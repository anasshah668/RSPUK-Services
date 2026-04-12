import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * If a valid Bearer token is present, attaches req.user (same shape as protect).
 * Does not reject when the token is missing or invalid (guest requests).
 */
export const optionalAuth = async (req, res, next) => {
  req.user = null;

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer')) {
    return next();
  }

  const token = header.split(' ')[1];
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user) {
      req.user = user;
    }
  } catch {
    /* guest */
  }

  next();
};
