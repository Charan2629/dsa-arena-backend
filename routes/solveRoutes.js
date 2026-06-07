const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const User     = require('../models/User');
const SolveLog = require('../models/SolveLog');
const { recordSolve, getSolves, getAirdrop } = require('../controllers/solveController');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POINTS_MAP = { Easy: 10, Medium: 30, Hard: 50 };

// ---------------------------------------------------------------------------
// POST /api/solves — Record a manual problem solve
// ---------------------------------------------------------------------------
router.post('/', recordSolve);

// ---------------------------------------------------------------------------
// GET /api/solves/airdrop — Today's deterministic bounty topic
// Must be declared BEFORE GET / so Express matches it first
// ---------------------------------------------------------------------------
router.get('/airdrop', getAirdrop);

// ---------------------------------------------------------------------------
// GET /api/solves — Ledger Feed (History)
// ---------------------------------------------------------------------------
router.get('/', getSolves);

// ---------------------------------------------------------------------------
// POST /api/solves/sync — LeetCode Auto-Sync Engine
// Syncs LeetCode (GraphQL + real difficulty).
// Updates both dailyScore AND totalScore, and resets HP inactivity tracking.
// ---------------------------------------------------------------------------
router.post('/sync', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!user.leetcodeUsername) {
      return res.status(400).json({
        error: 'No LeetCode username configured. Please link your LeetCode username in Settings.'
      });
    }

    let totalNewSolves  = 0;
    let totalPoints     = 0;
    const syncResults   = {};

    // ── LeetCode Sync (GraphQL with real difficulty) ─────────────────────
    try {
        // Step 1a: Fetch the 20 most recent Accepted submissions (id + titleSlug)
        const acResponse = await axios.post(
          'https://leetcode.com/graphql',
          {
            query: `
              query recentAcSubmissions($username: String!, $limit: Int!) {
                recentAcSubmissionList(username: $username, limit: $limit) {
                  id
                  title
                  titleSlug
                  timestamp
                }
              }
            `,
            variables: { username: user.leetcodeUsername, limit: 20 },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://leetcode.com',
            },
            timeout: 30000,
          }
        );

        const submissions = acResponse.data?.data?.recentAcSubmissionList ?? [];
        let lcNew = 0;
        let lcPts = 0;

        for (const sub of submissions) {
          // Deduplication: skip if we already logged this exact submission ID
          const exists = await SolveLog.findOne({ leetcodeSubmissionId: sub.id });
          if (exists) continue;

          // Step 1b: Fetch actual difficulty for this problem via its titleSlug
          let difficulty = 'Medium'; // safe fallback
          try {
            const problemRes = await axios.post(
              'https://leetcode.com/graphql',
              {
                query: `
                  query problemDifficulty($titleSlug: String!) {
                    question(titleSlug: $titleSlug) {
                      difficulty
                    }
                  }
                `,
                variables: { titleSlug: sub.titleSlug },
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': 'https://leetcode.com',
                },
                timeout: 30000,
              }
            );
            const fetched = problemRes.data?.data?.question?.difficulty;
            if (fetched && POINTS_MAP[fetched]) difficulty = fetched;
          } catch {
            // Non-fatal: fall back to 'Medium' if difficulty fetch fails
          }

          const earned = POINTS_MAP[difficulty];

          await SolveLog.create({
            userId:               user._id,
            problemTitle:         sub.title,
            submissionType:       'Automated_Sync',
            platform:             'LeetCode',
            difficulty,
            pointsEarned:         earned,
            leetcodeSubmissionId: sub.id,
            submittedAt:          new Date(sub.timestamp * 1000),
          });

          if (difficulty === 'Hard') {
            const io = req.app.get('io');
            if (io) {
              io.emit('HARD_PROBLEM_CONQUERED', { solver: user.username });
            }
          }

          lcPts += earned;
          lcNew++;
        }

        syncResults.leetcode = { newSolves: lcNew, pointsAdded: lcPts };
        totalNewSolves += lcNew;
        totalPoints    += lcPts;

    } catch (lcErr) {
      syncResults.leetcode = { error: 'LeetCode fetch failed. The API may be temporarily unavailable.' };
    }

    // ── Persist scores + HP + inactivity reset ────────────────────────────

    if (totalPoints > 0) {
      // Update BOTH dailyScore (feeds 4AM vault lock-in) and totalScore
      user.dailyScore += totalPoints;
      user.totalScore += totalPoints;

      // Reset inactivity — treat a successful sync as an active solve event
      user.lastSolveDate = new Date();
      user.lastSolveTime = new Date();

      // HP restore: cap at 100
      user.hp = Math.min(100, (user.hp ?? 100) + Math.min(totalNewSolves * 5, 20));
    }

    user.lastSyncedAt = new Date();
    await user.save();

    return res.json({
      success:       true,
      message:       totalNewSolves > 0
        ? `Sync complete! Found ${totalNewSolves} new solve${totalNewSolves !== 1 ? 's' : ''} (+${totalPoints} pts).`
        : 'Already up to date. No new solves detected.',
      totalNewSolves,
      totalPoints,
      breakdown:     syncResults,
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error during synchronization.' });
  }
});

module.exports = router;