const mongoose = require('mongoose');

const solveLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  problemTitle: {
    type: String,
    required: [true, 'Problem title / video title is required'],
    trim: true,
  },
  // 'Automated_Sync' | 'Manual_Problem' | 'Theory_Video' | 'Taunt' | 'System_Penalty'
  submissionType: {
    type: String,
    enum: ['Automated_Sync', 'Manual_Problem', 'Theory_Video', 'Taunt', 'System_Penalty'],
    default: 'Manual_Problem',
  },
  // 'LeetCode' | 'GeeksforGeeks' | 'YouTube' | 'Other' | 'System'
  platform: {
    type: String,
    enum: ['LeetCode', 'GeeksforGeeks', 'YouTube', 'Other', 'System'],
    default: 'Other',
  },
  // Optional — not required for Theory_Video entries (stored as 'N/A')
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'N/A'],
    default: 'N/A',
  },
  pointsEarned: {
    type: Number,
    required: true,
  },
  // Records which bonuses fired on this solve (audit trail)
  bonuses: {
    type: [String],
    default: [],
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  // Stores the LeetCode submission ID for Automated_Sync deduplication.
  // sparse:true means docs WITHOUT this field are excluded from the unique check.
  // IMPORTANT: no default:null — absent field (undefined) triggers sparse exclusion;
  //            explicit null does NOT and would cause dup-key collisions.
  leetcodeSubmissionId: {
    type: String,
    index: true,
    sparse: true,
    unique: true,
  },
  // GFG submission reference — stored for audit purposes only.
  // No unique/sparse constraint: GFG deduplication is handled at the app layer.
  gfgSubmissionId: {
    type: String,
  },
});

const SolveLog = mongoose.model('SolveLog', solveLogSchema);

// ---------------------------------------------------------------------------
// Drop the legacy gfgSubmissionId unique index from the live collection.
// This fires once on DB connection and is a no-op if the index is already gone.
// ---------------------------------------------------------------------------
mongoose.connection.once('open', async () => {
  try {
    await SolveLog.collection.dropIndex('gfgSubmissionId_1');
    console.log('🗑️  [SolveLog] Dropped legacy gfgSubmissionId unique index.');
  } catch (err) {
    if (err.codeName === 'IndexNotFound' || err.code === 27) {
      // Index already gone — nothing to do
    } else {
      console.warn('⚠️  [SolveLog] Could not drop gfgSubmissionId index:', err.message);
    }
  }
});

module.exports = SolveLog;
