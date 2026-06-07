const User = require('../models/User');
const SolveLog = require('../models/SolveLog');
const { io } = require('../server');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POINTS_MAP = { Easy: 10, Medium: 30, Hard: 50 };
const THEORY_VIDEO_POINTS = 15;
const SUBMISSION_TYPES = ['Automated_Sync', 'Manual_Problem', 'Theory_Video', 'Taunt', 'System_Penalty'];
const CODING_PLATFORMS = ['LeetCode', 'GeeksforGeeks', 'Other'];
const ALL_PLATFORMS    = ['LeetCode', 'GeeksforGeeks', 'YouTube', 'Other', 'System'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Helper to guarantee IST time checks
const getISTHour = () => {
  const istTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(istTime).getHours();
};

// Morning Blitz window: 7:00 AM – 9:00 AM (IST)
const isMorningBlitz = () => {
  const hour = getISTHour();
  return hour >= 7 && hour < 9;
};

// Early Bird Bonus window: 4:00 AM – 7:00 AM (IST) - Prevents 1.5x stacking with Morning Blitz
const isEarlyBird = () => {
  const hour = getISTHour();
  return hour >= 4 && hour < 7;
};

// ---------------------------------------------------------------------------
// @desc   Record a solve / video watch with full gamification logic
// @route  POST /api/solves
// ---------------------------------------------------------------------------
const recordSolve = async (req, res) => {
  let {
    userId,
    problemTitle,
    submissionType = 'Manual_Problem',
    platform,
    difficulty,
    isDesperationMode = false,
    isAirdrop = false,
  } = req.body;

  if (!userId || !problemTitle) {
    return res.status(400).json({ success: false, message: 'userId and problemTitle are required.' });
  }

  if (!SUBMISSION_TYPES.includes(submissionType)) {
    return res.status(400).json({ success: false, message: `Invalid submissionType.` });
  }

  const isTaunt = submissionType === 'Taunt';
  const isTheoryVideo = submissionType === 'Theory_Video';

  if (isTaunt) {
    platform = 'Other';
    difficulty = 'N/A';
  } else if (isTheoryVideo) {
    platform = 'YouTube';
    difficulty = 'N/A';
  } else {
    if (!difficulty || !POINTS_MAP[difficulty]) {
      return res.status(400).json({ success: false, message: 'Invalid or missing difficulty.' });
    }
    platform = platform || 'Other';
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (isTaunt) {
      const solveLog = await SolveLog.create({
        userId,
        problemTitle,
        submissionType: 'Taunt',
        platform: 'Other',
        difficulty: 'N/A',
        pointsEarned: 0,
        bonuses: [],
      });
      return res.status(201).json({
        success: true,
        message: `Taunt fired: "${problemTitle}"`,
        data: { solveLog, breakdown: { total: 0 }, updatedTotalScore: user.totalScore, updatedDailyScore: user.dailyScore },
      });
    }

    const bonuses = [];
    const basePoints = isTheoryVideo ? THEORY_VIDEO_POINTS : POINTS_MAP[difficulty];
    let points = basePoints;

    // 1. Time-Based Modifiers (Mutually Exclusive Window Hand-off)
    if (isEarlyBird()) {
      points = Math.round(points * 1.5);
      bonuses.push('Early Bird Bonus (×1.5)');
    } else if (isMorningBlitz()) {
      points = Math.round(points * 1.5);
      bonuses.push('Morning Blitz (×1.5)');
    }

    // 2. Global First Solve Flag Check
    let firstBountyAwarded = false;
    if (!global.firstSolveClaimed) {
      points += 20;
      firstBountyAwarded = true;
      bonuses.push('First Code Bounty (+20)');
    }

    // 3. Desperation Multiplier
    if (isDesperationMode) {
      points = Math.round(points * 2);
      bonuses.push('Desperation Mode (×2.0)');
    }

    // 4. Flat Vault Additions
    if (isAirdrop) {
      points += 50;
      bonuses.push('Vault Airdrop (+50)');
    }

    // 5. 4:00 AM Lootbox (4:00 AM - 4:59 AM, Medium/Hard, not claimed)
    const currentHour = getISTHour();
    let lootboxRoll = null;

    if (currentHour === 4 && ['Medium', 'Hard'].includes(difficulty) && !user.dailyAirdropClaimed) {
      user.dailyAirdropClaimed = true;
      const roll = Math.random(); // 0.0 to 1.0

      if (roll < 0.50) {
        points += 20;
        bonuses.push('Lootbox: +20 pts');
        lootboxRoll = '20_PTS';
      } else if (roll < 0.80) {
        if (!user.activePerks) user.activePerks = {};
        user.activePerks.doubleXPUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
        bonuses.push('Lootbox: 2-Hour Double XP');
        lootboxRoll = 'DOUBLE_XP';
      } else if (roll < 0.95) {
        if (!user.activePerks) user.activePerks = {};
        user.activePerks.shieldActive = true;
        bonuses.push('Lootbox: Shield Active');
        lootboxRoll = 'SHIELD';
      } else {
        points += 100;
        if (!user.activePerks) user.activePerks = {};
        user.activePerks.unlockedTheme = 'NEON';
        bonuses.push('Lootbox: +100 pts & NEON Theme');
        lootboxRoll = 'JACKPOT';
      }
    }

    // Double XP Modifier Check & Clean up
    if (user.activePerks?.doubleXPUntil) {
      const now = new Date();
      const xpExpiration = new Date(user.activePerks.doubleXPUntil);

      if (now < xpExpiration) {
        points *= 2;
        bonuses.push('Double XP Active (×2.0)');
      } else {
        user.activePerks.doubleXPUntil = null; // Clear it if expired
      }
    }

    // 6. The 90-Min Powerplay — Steal mode if already active
    let powerplayActivated = false;
    let powerplaySteal = false;
    const opponent = await User.findOne({ _id: { $ne: userId } });

    if (user.powerplayUntil && new Date() < user.powerplayUntil && opponent && opponent.totalScore > 0) {
      // Steal 10 points from opponent's totalScore
      opponent.totalScore = Math.max(0, opponent.totalScore - 10);
      await opponent.save();
      points += 10;
      bonuses.push('Powerplay Steal (+10)');
      powerplaySteal = true;
    }

    // ── Strip any null / undefined / empty-string fields that could collide
    // with sparse unique indexes (e.g. leetcodeSubmissionId must be absent,
    // not null, for the sparse index to skip it).
    const solvePayload = {
      userId,
      problemTitle,
      submissionType,
      platform,
      difficulty,
      pointsEarned: points,
      bonuses,
    };
    // Purge keys whose value is null, undefined, or empty string
    Object.keys(solvePayload).forEach((key) => {
      if (solvePayload[key] === null || solvePayload[key] === undefined || solvePayload[key] === '') {
        delete solvePayload[key];
      }
    });

    const solveLog = await SolveLog.create(solvePayload);

    // Powerplay Activation Check — runs AFTER save so this solve is counted
    // Trigger: >= 3 solves in the last 90 minutes
    if (!powerplaySteal && (!user.powerplayUntil || new Date() >= user.powerplayUntil)) {
      const recentSolvesCount = await SolveLog.countDocuments({
        userId: user._id,
        submissionType: { $ne: 'Taunt' },
        submittedAt: { $gte: new Date(Date.now() - 90 * 60 * 1000) },
      });
      if (recentSolvesCount >= 3) {
        user.powerplayUntil = new Date(Date.now() + 60 * 60 * 1000); // 60 mins from now
        bonuses.push('Powerplay Activated (60m)');
        powerplayActivated = true;
        console.log(`⚡ [POWERPLAY] Activated for ${user.username} (${recentSolvesCount} solves in 90m)`);
      }
    }

    // Vault deposit happens at 4:00 AM, only update dailyScore for now
    user.dailyScore += points;
    // The Medkit: add 20 HP
    user.hp = Math.min(100, (user.hp || 100) + 20);
    user.lastSolveDate = new Date();

    // 30-Day God Streak — auto-unlock NEON theme
    if (user.currentStreak >= 30) {
      if (!user.activePerks) user.activePerks = {};
      user.activePerks.unlockedTheme = 'NEON';
    }

    await user.save();

    // 7. Safe State Mutation
    if (firstBountyAwarded) {
      global.firstSolveClaimed = true;
    }

    // 8. Fully Populated Response Receipt
    const breakdown = {
      submissionType,
      platform,
      difficulty,
      base: basePoints,
      earlyBird: isEarlyBird() ? '×1.5' : null,
      morningBlitz: isMorningBlitz() ? '×1.5' : null,
      firstBounty: firstBountyAwarded ? '+20' : null,
      desperation: isDesperationMode ? '×2.0' : null,
      airdrop: isAirdrop ? '+50' : null,
      total: points,
    };

    io.emit('combatFeed', {
      username: user.username,
      message: 'just logged a solve!',
      points: points,
      isFirst: firstBountyAwarded,
      isBlitz: isMorningBlitz(),
      isPowerplayActivated: powerplayActivated,
      isPowerplaySteal: powerplaySteal,
      lootboxRoll: lootboxRoll
    });

    if (difficulty === 'Hard') {
      io.emit('HARD_PROBLEM_CONQUERED', { solver: user.username });
    }

    return res.status(201).json({
      success: true,
      message: `Logged! +${points} pts.${bonuses.length ? ' Bonuses: ' + bonuses.join(', ') + '.' : ''}`,
      data: {
        solveLog,
        breakdown,
        updatedTotalScore: user.totalScore,
        updatedDailyScore: user.dailyScore,
      },
    });
  } catch (error) {
    console.error('recordSolve error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ... [getSolves and getAirdrop logic remains exactly the same below this line]
const getSolves = async (req, res) => {
  try {
    const solves = await SolveLog.find()
      .populate('userId', 'username')
      .sort({ submittedAt: -1 })
      .limit(50);
    const formattedSolves = solves.map((solve) => ({
      ...solve.toObject(),
      username: solve.userId?.username || 'Unknown',
    }));
    return res.status(200).json({ success: true, data: formattedSolves });
  } catch (error) {
    console.error('getSolves error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error fetching ledger.' });
  }
};

const AIRDROP_TOPICS = [
  'Arrays & Hashing', 'Dynamic Programming', 'Graphs', 'Trees',
  'Binary Search', 'Two Pointers', 'Sliding Window', 'Backtracking',
  'Heaps & Priority Queues', 'Greedy Algorithms', 'Linked Lists',
  'Stacks & Queues', 'Tries', 'Math & Number Theory',
];

const AIRDROP_BONUS = 50;

const getAirdrop = (req, res) => {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const topic = AIRDROP_TOPICS[seed % AIRDROP_TOPICS.length];
  return res.status(200).json({
    success: true,
    data: { topic, bonus: AIRDROP_BONUS, date: today.toISOString().slice(0, 10) },
  });
};

module.exports = { recordSolve, getSolves, getAirdrop };