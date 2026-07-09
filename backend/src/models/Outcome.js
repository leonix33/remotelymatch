const mongoose = require('mongoose');

const outcomeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: String, required: true },
    title: String,
    company: String,
    stage: {
      type: String,
      enum: ['applied', 'screen', 'onsite', 'offer', 'rejected', 'withdrawn'],
      default: 'applied',
    },
    matchPct: Number,
    notes: String,
    lessonsLearned: String,
    source: String,
  },
  { timestamps: true }
);

outcomeSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('Outcome', outcomeSchema);
