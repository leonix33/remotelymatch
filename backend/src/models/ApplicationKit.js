const mongoose = require('mongoose');

const applicationKitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: String, required: true, index: true },
    tailored: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

applicationKitSchema.index({ userId: 1, jobId: 1 }, { unique: true });
applicationKitSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('ApplicationKit', applicationKitSchema);
