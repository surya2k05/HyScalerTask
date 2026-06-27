const jwt = require('jsonwebtoken');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'taskflow-access-secret-12345-qwerty';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'taskflow-refresh-secret-12345-qwerty';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET
};
