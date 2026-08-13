const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { generateAnonymousId } = require('../utils/anonymousId');
const { generateSessionToken, hashToken } = require('../utils/authToken');
const { validateEmail, validatePassword, sanitizeInput } = require('../utils/validator');
const config = require('../config');

const register = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const cleanEmail = sanitizeInput(email.toLowerCase());
    
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }
    
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    const anonymousId = await generateAnonymousId();
    const passwordHash = await bcrypt.hash(password, 12);
    
    const result = await query(
      `INSERT INTO users (email, password_hash, anonymous_id)
       VALUES ($1, $2, $3)
       RETURNING id, email, anonymous_id, role, status, created_at`,
      [cleanEmail, passwordHash, anonymousId]
    );
    
    const user = result.rows[0];
    
    await query(
      `INSERT INTO user_settings (user_id)
       VALUES ($1)`,
      [user.id]
    );
    
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + config.sessionMaxAge);
    
    await query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );
    
    res.cookie(config.cookieName, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: config.sessionMaxAge
    });
    
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          anonymous_id: user.anonymous_id,
          role: user.role,
          status: user.status
        }
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const cleanEmail = sanitizeInput(email.toLowerCase());
    
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [cleanEmail]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const user = result.rows[0];
    
    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'Account is banned'
      });
    }
    
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended'
      });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + config.sessionMaxAge);
    
    await query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );
    
    res.cookie(config.cookieName, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: config.sessionMaxAge
    });
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          anonymous_id: user.anonymous_id,
          role: user.role,
          status: user.status
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies[config.cookieName];
    
    if (token) {
      const tokenHash = hashToken(token);
      await query(
        'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
        [tokenHash]
      );
    }
    
    res.clearCookie(config.cookieName);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

const me = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, anonymous_id, role, status, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

module.exports = { register, login, logout, me };
