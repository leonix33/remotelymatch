const OpenAI = require('openai');
const env = require('../config/env');
const profileService = require('./profileService');
const { decryptApiKey, maskApiKey, isValidKeyFormat } = require('./openaiKeyCrypto');

function defaultModel() {
  return env.openaiModel || 'gpt-4o-mini';
}

async function resolveApiKey(userId) {
  if (userId) {
    const profile = await profileService.getRaw(userId);
    if (profile?.openaiApiKeyEncrypted) {
      const decrypted = decryptApiKey(profile.openaiApiKeyEncrypted);
      if (decrypted) return { key: decrypted, source: 'user' };
    }
  }
  if (env.openaiApiKey) {
    return { key: env.openaiApiKey, source: 'server' };
  }
  return { key: null, source: null };
}

async function isLive(userId) {
  const { key } = await resolveApiKey(userId);
  return Boolean(key);
}

async function getClient(userId) {
  const { key } = await resolveApiKey(userId);
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function chatCompletion(userId, { messages, model, temperature = 0.6, max_tokens = 600, response_format }) {
  const client = await getClient(userId);
  if (!client) return null;
  const payload = {
    model: model || defaultModel(),
    messages,
    temperature,
    max_tokens,
  };
  if (response_format) payload.response_format = response_format;
  const response = await client.chat.completions.create(payload);
  return response.choices[0]?.message?.content?.trim() || '';
}

async function testConnection(userId) {
  const client = await getClient(userId);
  if (!client) {
    const err = new Error('No OpenAI API key configured. Add your key in Profile → AI Integration.');
    err.status = 400;
    throw err;
  }
  const response = await client.chat.completions.create({
    model: defaultModel(),
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 8,
  });
  const text = response.choices[0]?.message?.content?.trim() || '';
  return { ok: true, model: defaultModel(), reply: text };
}

async function statusForUser(userId) {
  const { source } = await resolveApiKey(userId);
  const live = Boolean(source);
  const profile = userId ? await profileService.getOrCreate(userId) : null;
  return {
    configured: live,
    source,
    model: defaultModel(),
    keyHint: profile?.openaiKeyHint || (source === 'server' ? maskApiKey(env.openaiApiKey) : null),
    features: [
      'AI Coach (Connect)',
      'Resume tailoring & application kits',
      'Cover letters',
      'Interview practice',
      'Match copilot & company intel',
      'LinkedIn build-in-public drafts',
    ],
  };
}

module.exports = {
  maskApiKey,
  isValidKeyFormat,
  defaultModel,
  resolveApiKey,
  isLive,
  getClient,
  chatCompletion,
  testConnection,
  statusForUser,
};