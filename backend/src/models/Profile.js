const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, trim: true, default: '' },
    headline: { type: String, trim: true, default: '' },
    bio: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    portfolio: { type: String, default: '' },
    targetTitles: { type: [String], default: [] },
    mustHaveSkills: { type: [String], default: [] },
    niceToHaveSkills: { type: [String], default: [] },
    targetCompanies: { type: [String], default: [] },
    resumeText: { type: String, default: '' },
    minMatchScore: { type: Number, default: 60 },
    onboardingComplete: { type: Boolean, default: false },
    extractedSkills: { type: [String], default: [] },
    resumeFileName: { type: String, default: '' },
    resumeParsedAt: { type: Date },
    savedJobs: {
      type: [
        {
          jobId: { type: String, required: true },
          title: String,
          company: String,
          url: String,
          matchPct: { type: Number, default: 0 },
          savedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    linkedinSavedSearches: {
      type: [
        {
          id: String,
          label: String,
          url: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', profileSchema);
