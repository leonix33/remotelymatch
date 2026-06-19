const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['personal', 'interview', 'deadline', 'application', 'conference', 'reminder'],
      default: 'personal',
    },
    startDate: { type: Date, required: true, index: true },
    endDate: Date,
    allDay: { type: Boolean, default: false },
    location: { type: String, default: '' },
    url: { type: String, default: '' },
    color: { type: String, default: 'teal' },
    sourceId: { type: String, default: '' },
    sourceType: { type: String, default: '' },
  },
  { timestamps: true }
);

calendarEventSchema.index({ userId: 1, startDate: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
