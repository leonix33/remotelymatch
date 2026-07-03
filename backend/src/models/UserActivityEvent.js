const mongoose = require('mongoose');

const userActivityEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    userName: { type: String, default: '' },
    type: { type: String, required: true, index: true },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '', index: true },
    summary: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

userActivityEventSchema.index({ occurredAt: -1 });
userActivityEventSchema.index({ userId: 1, occurredAt: -1 });
userActivityEventSchema.index({ type: 1, occurredAt: -1 });

module.exports = mongoose.model('UserActivityEvent', userActivityEventSchema);
