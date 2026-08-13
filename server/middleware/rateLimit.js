const rateLimit = require('express-rate-limit');
const config = require('../config');

const apiLimiter = rateLimit({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.max,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.authMax,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const uploadLimiter = rateLimit({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.uploadMax,
  message: {
    success: false,
    message: 'Too many uploads, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
