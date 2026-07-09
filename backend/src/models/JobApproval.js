const mongoose = require('mongoose');

const jobApprovalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: String, required: true },
    title: String,
    company: String,
    url: String,
    applyUrl: String,
    matchPct: { type: Number, default: 0 },
    atsType: String,
    source: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'applied'],
      default: 'pending',
    },
    notes: { type: String, default: '' },
    reviewedAt: Date,
    applicantCount: Number,
    applicantCountLabel: String,
    applicantCountCapped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

jobApprovalSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('JobApproval', jobApprovalSchema);
