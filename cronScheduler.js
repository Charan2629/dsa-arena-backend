const cron    = require('node-cron');
const User     = require('./models/User');
const SolveLog = require('./models/SolveLog');

// ---------------------------------------------------------------------------
// Helper — true IST hour (bypasses server timezone)
// ---------------------------------------------------------------------------
const getISTHour = () => {
  const istTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istTime).getHours();
};

// ---------------------------------------------------------------------------
// Note: Midnight reset has been unified into the 4:00 AM daily reset
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hourly HP Decay — runs every hour at minute 0 IST
//
// Inactivity rule: if lastSolveDate is null OR more than 6 hours have passed
// since the user's last solve, they are considered inactive and lose 5 HP.
// Shield perk blocks decay entirely.
//
// Crash (hp reaches 0):
//   • Total score docked 20 %
//   • HP reset to 100 for the next cycle
//   • A 'System_Penalty' Strike log is written to DB for frontend display
// ---------------------------------------------------------------------------
const scheduleHourlyDecay = () => {
  cron.schedule('0 * * * *', async () => {
    const hour = getISTHour();

    // Only active between 6:00 AM and 11:00 PM IST
    if (hour < 6 || hour > 23) return;

    console.log(`\n⏳ [CRON] Hourly decay triggered (Hour: ${hour} IST)`);

    try {
      const users = await User.find({});
      if (users.length === 0) return;

      const now = new Date();

      for (const user of users) {
        // ── Inactivity check ───────────────────────────────────────────────
        // Inactive = no solve ever, OR last solve was > 6 hours ago
        const lastSolve      = user.lastSolveDate ? new Date(user.lastSolveDate) : null;
        const hoursSinceLastSolve = lastSolve
          ? (now - lastSolve) / (1000 * 60 * 60)
          : Infinity;

        const isInactive = hoursSinceLastSolve > 6;

        // Shield perk blocks all decay
        if (!isInactive || user.activePerks?.shieldActive) continue;

        // ── Apply decay with hard floor at 0 ──────────────────────────────
        user.hp = Math.max(0, user.hp - 5);

        // ── Death / Crash state ────────────────────────────────────────────
        if (user.hp === 0) {
          const scoreLost = Math.floor(user.totalScore * 0.2);
          user.totalScore = user.totalScore - scoreLost;
          user.hp         = 100; // Reset HP for the next cycle

          console.log(`💥 [CRON] SYSTEM CRASH: ${user.username} lost ${scoreLost} pts. HP reset to 100.`);

          // Write a Strike / death record so the frontend can surface it
          try {
            await SolveLog.create({
              userId:         user._id,
              problemTitle:   `System Crash — HP reached 0 (−${scoreLost} pts penalty)`,
              submissionType: 'System_Penalty',
              platform:       'System',
              difficulty:     'N/A',
              pointsEarned:   -scoreLost,
            });
          } catch (logErr) {
            console.error(`❌ [CRON] Failed to write Strike log for ${user.username}:`, logErr.message);
          }
        }

        await user.save();
      }
    } catch (err) {
      console.error(`❌ [CRON] Hourly decay failed: ${err.message}`);
    }
  }, {
    timezone: 'Asia/Kolkata', // Lock cron tick to IST
  });

  console.log('🕓 Hourly decay cron job scheduled for minute 0 (IST).');
};

module.exports = { scheduleHourlyDecay };