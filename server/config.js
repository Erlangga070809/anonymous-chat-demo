require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || 'anonymous-chat-secret-key-2024',
  sessionMaxAge: 7 * 24 * 60 * 60 * 1000,
  cookieName: 'anony_session',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
  uploadDir: 'uploads',
  maxFileSize: 5 * 1024 * 1024,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedVoiceTypes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav'],
  rateLimits: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    authMax: 10,
    uploadMax: 30
  }
};

module.exports = config;
