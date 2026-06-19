const CalendarEvent = require('../models/CalendarEvent');
const conferenceService = require('./conferenceService');
const env = require('../config/env');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required for calendar');
}

function monthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

async function listForUser(userId, { year, month } = {}) {
  requireMongo();
  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || now.getMonth() + 1;
  const { start, end } = monthRange(y, m);

  const [personal, conferences] = await Promise.all([
    CalendarEvent.find({
      userId,
      startDate: { $gte: start, $lte: end },
    })
      .sort({ startDate: 1 })
      .lean(),
    conferenceService.list({ weekOnly: false }).catch(() => []),
  ]);

  const confEvents = conferences
    .filter((c) => {
      const d = new Date(c.startDate);
      return d >= start && d <= end;
    })
    .map((c) => ({
      id: `conf-${c._id || c.id}`,
      title: c.name,
      description: c.description || '',
      type: 'conference',
      startDate: c.startDate,
      endDate: c.endDate,
      allDay: true,
      location: c.location || c.city,
      url: c.url,
      color: c.format === 'remote' ? 'teal' : c.format === 'in_person' ? 'amber' : 'slate',
      sourceType: 'conference',
      readOnly: true,
    }));

  const userEvents = personal.map((e) => ({
    id: e._id,
    title: e.title,
    description: e.description,
    type: e.type,
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.allDay,
    location: e.location,
    url: e.url,
    color: e.color,
    readOnly: false,
  }));

  return [...userEvents, ...confEvents].sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );
}

async function upcoming(userId, days = 14) {
  requireMongo();
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  const events = await listForUser(userId, {
    year: start.getFullYear(),
    month: start.getMonth() + 1,
  });
  const nextMonth = start.getMonth() + 2;
  const nextYear = nextMonth > 12 ? start.getFullYear() + 1 : start.getFullYear();
  const more = await listForUser(userId, {
    year: nextYear,
    month: nextMonth > 12 ? 1 : nextMonth,
  });
  const all = [...events, ...more];
  const seen = new Set();
  return all
    .filter((e) => {
      const d = new Date(e.startDate);
      if (d < start || d > end) return false;
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

async function create(userId, data) {
  requireMongo();
  return CalendarEvent.create({ userId, ...data });
}

async function update(userId, id, data) {
  requireMongo();
  const event = await CalendarEvent.findOne({ _id: id, userId });
  if (!event) throw new Error('Event not found');
  Object.assign(event, data);
  await event.save();
  return event;
}

async function remove(userId, id) {
  requireMongo();
  const result = await CalendarEvent.findOneAndDelete({ _id: id, userId });
  if (!result) throw new Error('Event not found');
}

module.exports = { listForUser, upcoming, create, update, remove };
