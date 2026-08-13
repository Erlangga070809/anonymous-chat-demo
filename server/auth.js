const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const config = require('../config');

const generateAnonymousId = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = 'anony #' + Math.floor(10000 + Math.random() * 90000);
    const result = await pool.query('SELECT id FROM users WHERE anonymous_id = $1', [id]);
    if (result.rows.length === 0) {
      return id;
    }
  }
  throw new Error('Failed to generate unique anonymous ID');
};

const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiry });
};

const createSession = async (userId) => {
  const token = generateToken(userId);
  const expiresAt = new Date(Date.now() + config.cookieMaxAge);
  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
  return token;
};

const validateSession = async (req, res, next) => {
  try {
    const token = req.cookies.session || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, config.jwtSecret);
    const result = await pool.query(
      `SELECT s.*, u.status, u.banned_until 
       FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.token = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }
    
    const session = result.rows[0];
    if (session.status === 'banned') {
      if (session.banned_until && new Date(session.banned_until) > new Date()) {
        return res.status(403).json({ success: false, message: 'Account is banned' });
      }
      if (!session.banned_until) {
        return res.status(403).json({ success: false, message: 'Account is permanently banned' });
      }
    }
    
    req.user = { id: session.user_id };
    req.session = session;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid session' });
  }
};

const requireRole = (...roles) => {
  return async (req, res, next) => {
    try {
      const result = await pool.query('SELECT role, status FROM users WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      const user = result.rows[0];
      if (user.status === 'banned' || user.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Account is restricted' });
      }
      if (!roles.includes(user.role)) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
      }
      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Authorization error' });
    }
  };
};

module.exports = {
  generateAnonymousId,
  hashPassword,
  verifyPassword,
  generateToken,
  createSession,
  validateSession,
  requireRole
};
