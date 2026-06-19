const mongoose = require('mongoose');

const communityResumeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, default: '' },
    title: { type: String, required: true, trim: true },
    headline: { type: String, default: '' },
    targetRole: { type: String, default: '' },
    content: { type: String, required: true },
    skills: [String],
    tags: [String],
    yearsExperience: { type: Number, default: 0 },
    public: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    copies: { type: Number, default: 0 },
    linkedinUrl: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

communityResumeSchema.index({ public: 1, createdAt: -1 });
communityResumeSchema.index({ tags: 1 });

module.exports = mongoose.model('CommunityResume', communityResumeSchema);
