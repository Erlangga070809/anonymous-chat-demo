const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl && config.databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        anonymous_id VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        status VARCHAR(20) DEFAULT 'normal',
        discoverability BOOLEAN DEFAULT TRUE,
        online_status BOOLEAN DEFAULT FALSE,
        allow_images BOOLEAN DEFAULT TRUE,
        allow_voice BOOLEAN DEFAULT TRUE,
        language VARCHAR(10) DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP,
        banned_until TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS matchmaking_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        searching BOOLEAN DEFAULT TRUE
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        ended_by INTEGER REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'active'
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message_type VARCHAR(20) DEFAULT 'text',
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        deleted_at TIMESTAMP,
        deleted_by INTEGER REFERENCES users(id)
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_type VARCHAR(50),
        file_size INTEGER,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id),
        category VARCHAR(50),
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id)
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id SERIAL PRIMARY KEY,
        blocker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(blocker_id, blocked_id)
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50),
        title TEXT,
        message TEXT,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS moderation_actions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        moderator_id INTEGER REFERENCES users(id),
        action_type VARCHAR(50),
        reason TEXT,
        duration VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS policy_acceptances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        policy_type VARCHAR(50),
        policy_version VARCHAR(20),
        accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS moderation_flags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        flag_type VARCHAR(50),
        severity INTEGER DEFAULT 1,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { pool, initDatabase };
