const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    // Resets to 0 every day at 4 AM by the cron job
    dailyScore: {
      type: Number,
      default: 0,
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    lifetimeHighestStreak: {
      type: Number,
      default: 0,
    },
    dailyCrowns: {
      type: Number,
      default: 0,
    },
    hp: {
      type: Number,
      default: 100,
    },
    // Tracks the date of the user's most recent solve (for streak verification)
    lastSolveDate: {
      type: Date,
      default: null,
    },
    lastSolveTime: {
      type: Date,
      default: null,
    },
    // LeetCode handle — required for Automated_Sync. Set via DB or future profile endpoint.
    leetcodeUsername: {
      type: String,
      default: null,
      trim: true,
    },
    gfgUsername: {
      type: String,
      default: null,
      trim: true,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    // Tracks the last known GFG solved count for delta-based deduplication
    gfgSolvedCount: {
      type: Number,
      default: 0,
    },
    // V2.0 Gamification fields
    powerplayUntil: {
      type: Date,
      default: null,
    },
    dailyAirdropClaimed: {
      type: Boolean,
      default: false,
    },
    // Tracks whether the user has watched the Memory intro cinematic
    hasSeenIntro: {
      type: Boolean,
      default: false,
    },
    activePerks: {
      doubleXPUntil: {
        type: Date,
        default: null,
      },
      shieldActive: {
        type: Boolean,
        default: false,
      },
      unlockedTheme: {
        type: String,
        default: 'STANDARD',
      },
      equippedTheme: {
        type: String,
        default: 'STANDARD',
        enum: ['STANDARD', 'DARK_KNIGHT', 'NEON', 'TIER_1'],
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
