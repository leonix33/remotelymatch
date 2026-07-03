const Profile = require('../models/Profile');
const env = require('../config/env');
const profileFileService = require('./profileFileService');
const jobListCache = require('./jobListCache');
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

function enrichmentMeta(profile) {
  const hasUserHunter = Boolean(profile?.hunterApiKeyEncrypted);
  const hasUserApollo = Boolean(profile?.apolloApiKeyEncrypted);
  const hasServerHunter = Boolean(env.hunterApiKey);
  const hasServerApollo = Boolean(env.apolloApiKey);
  return {
    hunterConfigured: hasUserHunter || hasServerHunter,
    apolloConfigured: hasUserApollo || hasServerApollo,
    hunterKeyHint: profile?.hunterKeyHint || (hasServerHunter ? maskApiKey(env.hunterApiKey) : null),
    apolloKeyHint: profile?.apolloKeyHint || (hasServerApollo ? maskApiKey(env.apolloApiKey) : null),
    hunterKeySource: hasUserHunter ? 'user' : hasServerHunter ? 'server' : null,
    apolloKeySource: hasUserApollo ? 'user' : hasServerApollo ? 'server' : null,
  };
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
  const { openaiApiKeyEncrypted, hunterApiKeyEncrypted, apolloApiKeyEncrypted, ...safe } = doc;
  return enrichProfileResponse({
    ...safe,
    ...openaiMeta(doc),
    ...enrichmentMeta(doc),
    complete: isComplete(doc),
    mongoRequired: false,
  });
}

async function getRaw(userId) {
  if (!env.mongoUri) {
    return profileFileService.get(userId);
  }
  return Profile.findOne({ userId }).select('+openaiApiKeyEncrypted +hunterApiKeyEncrypted +apolloApiKeyEncrypted').lean();
}

async function getOrCreate(userId) {
  if (!env.mongoUri) {
    return toResponse(profileFileService.get(userId));
  }
  let profile = await Profile.findOne({ userId }).select('+openaiApiKeyEncrypted +hunterApiKeyEncrypted +apolloApiKeyEncrypted');
  if (!profile) {
    profile = await Profile.create({ userId });
  }
  return toResponse(profile);
}

async function update(userId, data) {
  let profile;
  if (!env.mongoUri) {
    profile = profileFileService.save(userId, data);
  } else {
    profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: data },
      { new: true, upsert: true }
    ).select('+openaiApiKeyEncrypted +hunterApiKeyEncrypted +apolloApiKeyEncrypted');
  }
  jobListCache.invalidate(userId);
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

async function setHunterKey(userId, apiKey) {
  const encrypted = encryptApiKey(apiKey);
  const hint = maskApiKey(apiKey);
  return update(userId, { hunterApiKeyEncrypted: encrypted, hunterKeyHint: hint || '' });
}

async function clearHunterKey(userId) {
  return update(userId, { hunterApiKeyEncrypted: '', hunterKeyHint: '' });
}

async function setApolloKey(userId, apiKey) {
  const encrypted = encryptApiKey(apiKey);
  const hint = maskApiKey(apiKey);
  return update(userId, { apolloApiKeyEncrypted: encrypted, apolloKeyHint: hint || '' });
}

async function clearApolloKey(userId) {
  return update(userId, { apolloApiKeyEncrypted: '', apolloKeyHint: '' });
}

module.exports = {
  getOrCreate,
  getRaw,
  update,
  setOpenAiKey,
  clearOpenAiKey,
  setHunterKey,
  clearHunterKey,
  setApolloKey,
  clearApolloKey,
  isComplete,
  toResponse,
  openaiMeta,
  enrichmentMeta,
};
