const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true },
    title: String,
    company: String,
    source: String,
    tier: String,
    jobUrl: String,
    applyUrl: String,
    status: { type: String, default: 'manual-review' },
    notes: String,
    filledFields: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    submittedAt: Date,
    lastAttempted: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Application', applicationSchema);
