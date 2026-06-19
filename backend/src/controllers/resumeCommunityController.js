const { z } = require('zod');
const resumeCommunityService = require('../services/resumeCommunityService');
const profileService = require('../services/profileService');

const createSchema = z.object({
  title: z.string().min(2).max(120),
  headline: z.string().max(200).optional(),
  targetRole: z.string().max(100).optional(),
  content: z.string().min(50).max(50000),
  skills: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  yearsExperience: z.number().min(0).max(50).optional(),
  public: z.boolean().default(true),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(500).optional(),
});

async function list(req, res, next) {
  try {
    const items = await resumeCommunityService.list({
      tag: req.query.tag,
      role: req.query.role,
      search: req.query.search,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    const items = await resumeCommunityService.mine(req.user.sub);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const resume = await resumeCommunityService.getById(req.params.id, req.user.sub);
    res.json(resume);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const body = createSchema.parse(req.body);
    const resume = await resumeCommunityService.create(req.user.sub, body);
    res.status(201).json(resume);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const body = createSchema.partial().parse(req.body);
    const resume = await resumeCommunityService.update(req.user.sub, req.params.id, body);
    res.json(resume);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await resumeCommunityService.remove(req.user.sub, req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}

async function copy(req, res, next) {
  try {
    await resumeCommunityService.recordCopy(req.params.id);
    res.json({ message: 'OK' });
  } catch (err) {
    next(err);
  }
}

async function importProfile(req, res, next) {
  try {
    const profile = await profileService.getOrCreate(req.user.sub);
    const resume = await resumeCommunityService.importFromProfile(req.user.sub, profile);
    res.status(201).json(resume);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, mine, getOne, create, update, remove, copy, importProfile };
