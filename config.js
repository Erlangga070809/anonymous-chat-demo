const config = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  jwtExpiry: '24h',
  cookieMaxAge: 24 * 60 * 60 * 1000,
  uploadMaxSize: 5 * 1024 * 1024,
  voiceMaxSize: 10 * 1024 * 1024,
  messageRateLimit: {
    windowMs: 60 * 1000,
    max: 20
  },
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  storagePath: process.env.STORAGE_PATH || './uploads',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000']
};

module.exports = config;
