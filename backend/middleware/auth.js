import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models.js';

export async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!mongoose.isObjectIdOrHexString(payload.sub)) return res.status(401).json({ message: 'Invalid sign-in token.' });
    const user = await User.findById(payload.sub).select('+tokenVersion');
    if (!user || !user.active) return res.status(401).json({ message: 'Your account is unavailable.' });
    if ((payload.ver ?? 0) !== (user.tokenVersion || 0)) return res.status(401).json({ message: 'Your session has expired. Sign in again.' });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Your session has expired. Sign in again.' });
    next(error);
  }
}

export function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    next();
  };
}
