const Profile = require('../models/Profile');
const env = require('../config/env');
const profileFileService = require('./profileFileService');
const { enrichProfileResponse } = require('./resumeParseService');
const { encryptApiKey, maskApiKey } = require('./openaiKeyCrypto');

function isComplete(profile) {
  const hasName = Boolean(
    profile?.applicantName?.trim() || profile?.displayName?.trim()
  );
  return Boolean(
    profile?.onboardingComplete &&
    hasName &&
    profile?.targetTitles?.length &&
    profile?.mustHaveSkills?.length
  );
}

function openaiMeta(profile) {
  const hasUserKey = Boolean(profile?.openaiApiKeyEncrypted);
  const hasServerKey = Boolean(env.openaiApiKey);
  const connected = hasUserKey || hasServerKey;
  let openaiKeySource = null;
  let openaiKeyHint = profile?.openaiKeyHint || null;
  if (hasUserKey) {
    openaiKeySource = 'user';
  } else if (hasServerKey) {
    openaiKeySource = 'server';
    openaiKeyHint = maskApiKey(env.openaiApiKey);
  }
  return { openaiConnected: connected, openaiKeySource, openaiKeyHint };
}

function toResponse(profile) {
  const doc = profile.toObject ? profile.toObject() : { ...profile };
  const { openaiApiKeyEncrypted, ...safe } = doc;
  return enrichProfileResponse({
    ...safe,
    ...openaiMeta(doc),
    complete: isComplete(doc),
    mongoRequired: false,
  });
}

async function getRaw(userId) {
  if (!env.mongoUri) {
    return profileFileService.get(userId);
  }
  return Profile.findOne({ userId }).select('+openaiApiKeyEncrypted').lean();
}

async function getOrCreate(userId) {
  if (!env.mongoUri) {
    return toResponse(profileFileService.get(userId));
  }
  let profile = await Profile.findOne({ userId }).select('+openaiApiKeyEncrypted');
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
  ).select('+openaiApiKeyEncrypted');
  return toResponse(profile);
}

async function setOpenAiKey(userId, apiKey) {
  const encrypted = encryptApiKey(apiKey);
  const hint = maskApiKey(apiKey);
  return update(userId, { openaiApiKeyEncrypted: encrypted, openaiKeyHint: hint || '' });
}

async function clearOpenAiKey(userId) {
  return update(userId, { openaiApiKeyEncrypted: '', openaiKeyHint: '' });
}

module.exports = { getOrCreate, getRaw, update, setOpenAiKey, clearOpenAiKey, isComplete, toResponse, openaiMeta };
