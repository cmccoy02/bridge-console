import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bridge-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';
const COOKIE_NAME = 'bridge_session';

export function generateJWT(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction, // Must be true for sameSite: 'none'
    sameSite: isProduction ? 'none' : 'lax', // 'none' allows cross-origin requests
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

export function clearAuthCookie(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  });
}

export async function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const decoded = verifyJWT(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  try {
    const db = await getDb();
    const user = await db.get(
      'SELECT id, username, email, "avatarUrl", "accessToken", "githubId" FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export async function optionalAuthMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    req.user = null;
    return next();
  }

  const decoded = verifyJWT(token);
  if (!decoded) {
    req.user = null;
    return next();
  }

  try {
    const db = await getDb();
    const user = await db.get(
      'SELECT id, username, email, "avatarUrl", "accessToken", "githubId" FROM users WHERE id = ?',
      [decoded.userId]
    );
    req.user = user || null;
  } catch (error) {
    req.user = null;
  }

  next();
}
