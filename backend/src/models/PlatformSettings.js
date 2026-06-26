const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'default', unique: true },
    adzunaAppId: { type: String, default: '' },
    adzunaAppKeyEncrypted: { type: String, default: '', select: false },
    adzunaWhat: { type: String, default: '' },
    adzunaWhere: { type: String, default: '' },
    updatedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.models.PlatformSettings || mongoose.model('PlatformSettings', platformSettingsSchema);
