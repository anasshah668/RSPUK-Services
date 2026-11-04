import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const readHeader = (req, name) => {
  const value = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
};

export const extractAccessToken = (req) => {
  const authorization = readHeader(req, 'authorization');
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const accessHeader = readHeader(req, 'x-access-token');
  if (accessHeader) {
    return accessHeader.toLowerCase().startsWith('bearer ')
      ? accessHeader.slice(7).trim()
      : accessHeader;
  }

  const bodyToken = req.body?.authToken || req.body?._token || req.body?.token;
  if (typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken.trim();
  }

  return null;
};

export const protect = async (req, res, next) => {
  const token = extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Admin only.' });
};
