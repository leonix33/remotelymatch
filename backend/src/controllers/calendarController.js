const { z } = require('zod');
const calendarService = require('../services/calendarService');

async function list(req, res, next) {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const events = await calendarService.listForUser(req.user.sub, { year, month });
    res.json(events);
  } catch (err) {
    next(err);
  }
}

async function upcoming(req, res, next) {
  try {
    const events = await calendarService.upcoming(req.user.sub, Number(req.query.days) || 14);
    res.json(events);
  } catch (err) {
    next(err);
  }
}

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['personal', 'interview', 'deadline', 'application', 'reminder']).default('personal'),
  startDate: z.union([z.string(), z.date()]),
  endDate: z.union([z.string(), z.date()]).optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  color: z.string().optional(),
});

async function create(req, res, next) {
  try {
    const body = eventSchema.parse(req.body);
    const event = await calendarService.create(req.user.sub, {
      ...body,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const body = eventSchema.partial().parse(req.body);
    const patch = { ...body };
    if (body.startDate) patch.startDate = new Date(body.startDate);
    if (body.endDate) patch.endDate = new Date(body.endDate);
    const event = await calendarService.update(req.user.sub, req.params.id, patch);
    res.json(event);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await calendarService.remove(req.user.sub, req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, upcoming, create, update, remove };
