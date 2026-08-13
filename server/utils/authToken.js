const crypto = require('crypto');
const config = require('../config');

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateSessionToken = () => {
  return generateToken();
};

module.exports = { generateToken, hashToken, generateSessionToken };
