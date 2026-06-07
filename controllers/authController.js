const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dsa_arena_fallback_secret_change_in_prod';
const JWT_EXPIRES_IN = '7d';

// ---------------------------------------------------------------------------
// Helper — generate a signed JWT for a user document
// ---------------------------------------------------------------------------
const signToken = (user) =>
  jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

// ---------------------------------------------------------------------------
// @desc   Register a new user
// @route  POST /api/auth/register
// @access Public
// ---------------------------------------------------------------------------
const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'username, email, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    // Check for existing user
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      const field = exists.email === email.toLowerCase() ? 'email' : 'username';
      return res.status(409).json({ success: false, message: `That ${field} is already taken.` });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ username, email, password: hashedPassword });

    const token = signToken(user);

    console.log(`✅ [Auth] Registered: ${username} <${email}>`);

    return res.status(201).json({
      success: true,
      message: 'Account created!',
      data: {
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          totalScore: user.totalScore,
          dailyScore: user.dailyScore,
          currentStreak: user.currentStreak,
          hp: user.hp,
          hasSeenIntro: user.hasSeenIntro,
        },
      },
    });
  } catch (err) {
    console.error('registerUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

// ---------------------------------------------------------------------------
// @desc   Log in an existing user
// @route  POST /api/auth/login
// @access Public
// ---------------------------------------------------------------------------
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required.' });
  }

  try {
    // Include password for comparison (normally excluded by select: false)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    console.log(`🔑 [Auth] Login: ${user.username} <${user.email}>`);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.username}!`,
      data: {
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          totalScore: user.totalScore,
          dailyScore: user.dailyScore,
          currentStreak: user.currentStreak,
          hp: user.hp,
          hasSeenIntro: user.hasSeenIntro,
        },
      },
    });
  } catch (err) {
    console.error('loginUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

module.exports = { registerUser, loginUser };
