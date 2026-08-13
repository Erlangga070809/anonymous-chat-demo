const { query } = require('../db');
const { hashToken } = require('../utils/authToken');
const config = require('../config');

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies[config.cookieName];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const tokenHash = hashToken(token);
    const result = await query(
      `SELECT s.*, u.id, u.email, u.anonymous_id, u.role, u.status, u.created_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = $1 
       AND s.expires_at > CURRENT_TIMESTAMP 
       AND s.revoked_at IS NULL`,
      [tokenHash]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }
    
    const session = result.rows[0];
    
    if (session.status === 'banned' || session.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }
    
    req.user = {
      id: session.id,
      email: session.email,
      anonymous_id: session.anonymous_id,
      role: session.role,
      status: session.status,
      sessionId: session.id
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  
  res.status(403).json({
    success: false,
    message: 'Admin access required'
  });
};

module.exports = { authenticate, requireAdmin };
