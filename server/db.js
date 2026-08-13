const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  maxUses: 7500,
  allowExitOnIdle: true
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('Slow query:', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('Database query error:', err.message);
    throw err;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  return client;
};

module.exports = { query, getClient, pool };
