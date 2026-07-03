const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    lastLoginMethod: { type: String, enum: ['password', 'passkey', ''], default: '' },
    loginCount: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: null },
    isMentor: { type: Boolean, default: false },
    verifiedSkills: [String],
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
