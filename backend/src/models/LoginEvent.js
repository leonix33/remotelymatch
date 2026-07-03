const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    userName: { type: String, default: '' },
    role: { type: String, default: 'user' },
    method: { type: String, enum: ['password', 'passkey'], default: 'password' },
    success: { type: Boolean, default: true, index: true },
    reason: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

loginEventSchema.index({ occurredAt: -1 });
loginEventSchema.index({ success: 1, occurredAt: -1 });

module.exports = mongoose.model('LoginEvent', loginEventSchema);
