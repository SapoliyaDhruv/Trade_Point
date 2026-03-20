const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log('[verifyToken] URL requested:', req.method, req.originalUrl);
  console.log('[verifyToken] Authorization header:', authHeader || '(missing)');

  if (!authHeader) {
    console.log('[verifyToken] → No token provided');
    return res.status(401).json({ msg: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    console.log('[verifyToken] → Token format invalid');
    return res.status(401).json({ msg: 'Invalid token format' });
  }

  console.log('[verifyToken] Token starts with:', token.substring(0, 10) + '...');

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    console.log('[verifyToken] Token valid → user:', decoded.id, decoded.role);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('[verifyToken] JWT verification failed:', err.name, err.message);
    console.error('[verifyToken] Secret used for verify:', config.jwt.secret);
    return res.status(401).json({ msg: 'Invalid token' });
  }
};

exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Admin access only' });
  }
  next();
};