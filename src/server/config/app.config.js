require('dotenv').config();

const getEnv = (key, fallback = '') => {
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : fallback;
};

const email = getEnv('APP_EMAIL');
const password = getEnv('APP_EMAIL_PASSWORD');
const jwtSecret = getEnv('JWT_SECRET');
const jwtExpiry = getEnv('JWT_EXPIRES_IN', '1h');
const mailFrom = getEnv('MAIL_FROM', email);

if (!jwtSecret) {
  console.warn('[config] JWT_SECRET is not set. Tokens will be insecure.');
}
if (!email || !password) {
  console.warn('[config] APP_EMAIL or APP_EMAIL_PASSWORD is not set. Email sending may fail.');
}

module.exports = {
  email,
  password,
  mailFrom,
  jwt: {
    secret: jwtSecret,
    expiry: jwtExpiry,
  },
};
