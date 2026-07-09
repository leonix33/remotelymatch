const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    title: String,
    company: String,
    location: String,
    url: String,
    applyUrl: { type: String, index: true },
    source: { type: String, index: true },
    tier: String,
    score: Number,
    matchPct: { type: Number, default: 0, index: true },
    atsType: { type: String, default: 'unknown' },
    emailSection: { type: String, default: 'manual_browse', index: true },
    firstSeen: Date,
    remoteType: { type: String, default: 'unknown' },
    salaryMin: Number,
    salaryMax: Number,
    skills: { type: [String], default: [] },
    description: String,
    postedAt: { type: Date, index: true },
    freshnessScore: { type: Number, default: 0, index: true },
    freshnessLabel: String,
    qualityScore: { type: Number, default: 0, index: true },
    isDirectEmployer: { type: Boolean, default: false },
    employerTrustLabel: String,
    postedAgeLabel: String,
    companyDomainVerified: { type: Boolean, default: null },
  },
  { timestamps: true }
);

jobSchema.index({ company: 1, title: 1 });

module.exports = mongoose.model('Job', jobSchema);
