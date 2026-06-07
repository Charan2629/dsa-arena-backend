const cron = require('node-cron');
const User = require('../models/User');
const SolveLog = require('../models/SolveLog');

// ---------------------------------------------------------------------------
// Daily Reset Job — runs every day at 4:00 AM (IST)
// ---------------------------------------------------------------------------
const scheduleDailyReset = () => {
  cron.schedule('0 4 * * *', async () => {
    const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    console.log(`\n⏰ [CRON] Daily Reset & Vault Sweep triggered at ${timestamp} (IST)`);

    try {
      const users = await User.find({});

      if (users.length === 0) {
        console.log('ℹ️  [CRON] No users found. Skipping reset.');
        return;
      }

      // --- Determine Daily Crown Winner ---
      let maxScore = 0;
      for (const user of users) {
        if (user.dailyScore > maxScore) {
          maxScore = user.dailyScore;
        }
      }

      if (maxScore > 0) {
        const winners = users.filter(u => u.dailyScore === maxScore);
        for (const winner of winners) {
          winner.dailyCrowns = (winner.dailyCrowns || 0) + 1;
          console.log(`👑 [CRON] Daily Crown awarded to ${winner.username} (Score: ${maxScore})`);
        }
      }

      let resetScoreCount = 0;
      let decayCount = 0;

      for (const user of users) {
        // --- 1. Loss Aversion Penalty & Vault Sweep ---
        if (user.dailyScore === 0) {
          // Penalty for 0 solves in the 4am-4am window
          const before = user.totalScore;
          user.totalScore = Math.max(0, user.totalScore - 25);
          user.currentStreak = 0; // Streak breaks if 0 solves
          decayCount++;
          console.log(`💀 [CRON] Penalty | ${user.username} | totalScore: ${before} → ${user.totalScore} | Streak broken`);
        } else {
          // Vault Deposit
          user.totalScore += user.dailyScore;
          console.log(`🏦 [CRON] Vault Sweep | ${user.username} banked ${user.dailyScore} pts.`);
        }

        // --- 2. Full Reset ---
        user.dailyScore = 0;
        user.hp = 100;
        user.dailyAirdropClaimed = false;
        
        if (user.activePerks) {
          user.activePerks.shieldActive = false;
        }

        await user.save();
        resetScoreCount++;
      }

      // 3. Global Resets
      global.firstSolveClaimed = false;

      console.log(`✅ [CRON] Reset complete — ${decayCount} penalised, ${resetScoreCount} users reset.\n`);
    } catch (error) {
      console.error(`❌ [CRON] Daily reset failed: ${error.message}`);
    }
  }, {
    timezone: "Asia/Kolkata"
  });

  console.log('🕓 Daily reset cron job scheduled for 4:00 AM (IST).');
};

module.exports = scheduleDailyReset;
