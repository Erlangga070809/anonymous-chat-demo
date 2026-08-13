const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 8 && password.length <= 100;
};

const validateAnonymousId = (id) => {
  return /^anony #\d{5}$/.test(id);
};

const validateMessageContent = (content) => {
  return content && content.trim().length > 0 && content.trim().length <= 5000;
};

const validateReportReason = (reason) => {
  const validReasons = [
    'harassment',
    'spam',
    'scam',
    'sexual_content',
    'hate_speech',
    'threat',
    'inappropriate_content',
    'other'
  ];
  return validReasons.includes(reason);
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>]/g, '').trim();
};

const validateFileType = (mimeType, allowedTypes) => {
  return allowedTypes.includes(mimeType);
};

module.exports = {
  validateEmail,
  validatePassword,
  validateAnonymousId,
  validateMessageContent,
  validateReportReason,
  sanitizeInput,
  validateFileType
};
