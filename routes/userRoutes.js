const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// @desc   Get all users sorted by totalScore descending
// @route  GET /api/users
// @access Public
router.get('/', async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ totalScore: -1 })
      .lean();

    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @desc   Update user accounts (leetcode/gfg)
// @route  PATCH /api/users/:id/accounts
// @access Public
router.patch('/:id/accounts', async (req, res) => {
  try {
    const { leetcodeUsername, gfgUsername } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.leetcodeUsername = leetcodeUsername !== undefined ? leetcodeUsername : user.leetcodeUsername;
    user.gfgUsername = gfgUsername !== undefined ? gfgUsername : user.gfgUsername;

    await user.save();

    return res.status(200).json({ success: true, message: 'Accounts updated successfully.', data: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @desc   Update user cosmetic perk preferences (e.g. equippedTheme)
// @route  PATCH /api/users/:id/perks
// @access Public
router.patch('/:id/perks', async (req, res) => {
  const ALLOWED_THEMES = ['STANDARD', 'DARK_KNIGHT', 'NEON', 'TIER_1'];
  try {
    const { equippedTheme } = req.body;

    if (equippedTheme && !ALLOWED_THEMES.includes(equippedTheme)) {
      return res.status(400).json({ success: false, message: 'Invalid theme value.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.activePerks) user.activePerks = {};
    if (equippedTheme !== undefined) user.activePerks.equippedTheme = equippedTheme;

    await user.save();
    return res.status(200).json({ success: true, message: 'Perks updated.', data: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// @desc   Mark the Memory intro cinematic as watched for the logged-in user
// @route  POST /api/users/intro-watched
// @access Private
router.post('/intro-watched', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.hasSeenIntro = true;
    await user.save();

    return res.status(200).json({ success: true, message: 'Intro marked as watched.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
