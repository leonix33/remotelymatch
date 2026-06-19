const CommunityResume = require('../models/CommunityResume');
const User = require('../models/User');
const env = require('../config/env');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required for community resumes');
}

async function list({ tag, role, search } = {}) {
  requireMongo();
  const q = { public: true };
  if (tag) q.tags = tag;
  if (role) q.targetRole = new RegExp(role, 'i');
  if (search) {
    q.$or = [
      { title: new RegExp(search, 'i') },
      { headline: new RegExp(search, 'i') },
      { targetRole: new RegExp(search, 'i') },
      { skills: new RegExp(search, 'i') },
    ];
  }
  const items = await CommunityResume.find(q)
    .sort({ featured: -1, views: -1, createdAt: -1 })
    .limit(100)
    .lean();
  return items.map((r) => ({
    id: r._id,
    userId: r.userId,
    userName: r.userName,
    title: r.title,
    headline: r.headline,
    targetRole: r.targetRole,
    skills: r.skills,
    tags: r.tags,
    yearsExperience: r.yearsExperience,
    views: r.views,
    copies: r.copies,
    featured: r.featured,
    createdAt: r.createdAt,
    preview: r.content.slice(0, 200),
  }));
}

async function getById(id, viewerId) {
  requireMongo();
  const resume = await CommunityResume.findById(id);
  if (!resume || (!resume.public && resume.userId.toString() !== viewerId?.toString())) {
    throw new Error('Resume not found');
  }
  await CommunityResume.findByIdAndUpdate(id, { $inc: { views: 1 } });
  return resume;
}

async function mine(userId) {
  requireMongo();
  return CommunityResume.find({ userId }).sort({ updatedAt: -1 }).lean();
}

async function create(userId, data) {
  requireMongo();
  const user = await User.findById(userId);
  return CommunityResume.create({
    userId,
    userName: user?.name || 'Member',
    ...data,
  });
}

async function update(userId, id, data) {
  requireMongo();
  const resume = await CommunityResume.findOne({ _id: id, userId });
  if (!resume) throw new Error('Resume not found');
  Object.assign(resume, data);
  await resume.save();
  return resume;
}

async function remove(userId, id) {
  requireMongo();
  const result = await CommunityResume.findOneAndDelete({ _id: id, userId });
  if (!result) throw new Error('Resume not found');
}

async function recordCopy(id) {
  requireMongo();
  await CommunityResume.findByIdAndUpdate(id, { $inc: { copies: 1 } });
}

async function importFromProfile(userId, profile) {
  requireMongo();
  if (!profile?.resumeText?.trim()) throw new Error('Add resume text to your profile first');
  const user = await User.findById(userId);
  return CommunityResume.create({
    userId,
    userName: user?.name || 'Member',
    title: `${profile.displayName || user?.name}'s Resume`,
    headline: profile.headline || '',
    targetRole: profile.targetTitles?.[0] || '',
    content: profile.resumeText,
    skills: profile.mustHaveSkills || [],
    tags: (profile.targetTitles || []).slice(0, 3).map((t) => t.toLowerCase().split(' ')[0]),
    public: true,
    notes: 'Imported from profile',
  });
}

module.exports = { list, getById, mine, create, update, remove, recordCopy, importFromProfile };
