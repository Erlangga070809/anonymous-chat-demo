require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  sessionMaxAge: 7 * 24 * 60 * 60 * 1000,
  cookieName: 'anony_session',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
  uploadDir: 'uploads',
  maxFileSize: 5 * 1024 * 1024,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedVoiceTypes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav'],
  rateLimits: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    authMax: 10,
    uploadMax: 30
  }
};

if (!config.sessionSecret) {
  throw new Error('SESSION_SECRET is required. Set it in .env file');
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it in .env file');
}

module.exports = config;
