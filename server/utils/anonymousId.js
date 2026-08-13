const { query } = require('../db');

const generateAnonymousId = async () => {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const anonymousId = `anony #${randomNum}`;
  
  const existing = await query('SELECT id FROM users WHERE anonymous_id = $1', [anonymousId]);
  
  if (existing.rows.length > 0) {
    return generateAnonymousId();
  }
  
  return anonymousId;
};

module.exports = { generateAnonymousId };
