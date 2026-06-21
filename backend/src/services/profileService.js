const Profile = require('../models/Profile');
const env = require('../config/env');
const profileFileService = require('./profileFileService');

function isComplete(profile) {
  return Boolean(
    profile?.onboardingComplete &&
    profile?.displayName?.trim() &&
    profile?.targetTitles?.length &&
    profile?.mustHaveSkills?.length
  );
}

function toResponse(profile) {
  const doc = profile.toObject ? profile.toObject() : profile;
  return {
    ...doc,
    complete: isComplete(doc),
    mongoRequired: false,
  };
}

async function getOrCreate(userId) {
  if (!env.mongoUri) {
    return toResponse(profileFileService.get(userId));
  }
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = await Profile.create({ userId });
  }
  return toResponse(profile);
}

async function update(userId, data) {
  if (!env.mongoUri) {
    const profile = profileFileService.save(userId, data);
    return toResponse(profile);
  }
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $set: data },
    { new: true, upsert: true }
  );
  return toResponse(profile);
}

module.exports = { getOrCreate, update, isComplete, toResponse };
