const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dsa_arena_fallback_secret_change_in_prod';

// ---------------------------------------------------------------------------
// protect — verify the JWT in the Authorization: Bearer <token> header.
// Attaches req.user (full DB document) if valid.
// ---------------------------------------------------------------------------
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach a lean user object — exclude password from req.user
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Token valid but user no longer exists.' });
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ success: false, message: 'Not authorized. Invalid or expired token.' });
  }
};

module.exports = { protect };
