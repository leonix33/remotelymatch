const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, trim: true, default: '' },
    applicantName: { type: String, trim: true, default: '' },
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
    tailorResumeOnApply: { type: Boolean, default: false },
    autoApplyEnabled: { type: Boolean, default: false },
    defaultApplyResumeMode: { type: String, enum: ['base', 'tailored'], default: 'tailored' },
    digestEmail: { type: String, default: '' },
    notificationEmail: { type: String, default: '' },
    emailDigestEnabled: { type: Boolean, default: true },
    applySummaryEmailsEnabled: { type: Boolean, default: true },
    followUpRemindersEnabled: { type: Boolean, default: true },
    contactPhone: { type: String, default: '' },
    defaultSupplementPages: { type: Number, default: 3, min: 1, max: 6 },
    defaultTailorMode: { type: String, enum: ['balanced', 'high_match'], default: 'high_match' },
    defaultQuickApplyCount: { type: Number, default: 5, min: 3, max: 50 },
    highMatchTarget: { type: Number, default: 100, min: 95, max: 100 },
    hunterApiKeyEncrypted: { type: String, default: '', select: false },
    apolloApiKeyEncrypted: { type: String, default: '', select: false },
    hunterKeyHint: { type: String, default: '' },
    apolloKeyHint: { type: String, default: '' },
    openaiApiKeyEncrypted: { type: String, default: '', select: false },
    openaiKeyHint: { type: String, default: '' },
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
    jobBoardSelections: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', profileSchema);
