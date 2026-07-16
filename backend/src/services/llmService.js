const env = require('../config/env');
const openaiService = require('./openaiService');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function anthropicModel() {
  return env.anthropicModel || 'claude-sonnet-4-5';
}

function openaiModel() {
  return env.openaiModel || 'gpt-4o-mini';
}

function hasAnthropicKey() {
  return Boolean(env.anthropicApiKey);
}

async function isLive(userId) {
  if (hasAnthropicKey()) return true;
  return openaiService.isLive(userId);
}

function splitSystemMessages(messages = []) {
  const systemParts = [];
  const chat = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(String(msg.content || ''));
    } else {
      chat.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg.content || ''),
      });
    }
  }
  if (!chat.length) {
    chat.push({ role: 'user', content: 'Return valid JSON.' });
  }
  return {
    system: systemParts.filter(Boolean).join('\n\n'),
    messages: chat,
  };
}

function extractJsonText(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

async function callClaude({ messages, temperature = 0.38, max_tokens = 4000, json = true }) {
  if (!env.anthropicApiKey) {
    const err = new Error('Anthropic API key not configured');
    err.status = 400;
    throw err;
  }

  const { system, messages: chatMessages } = splitSystemMessages(messages);
  const systemWithJson = json
    ? `${system}\n\nReturn ONLY valid JSON. No markdown fences, no commentary.`
    : system;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: anthropicModel(),
      max_tokens,
      temperature,
      system: systemWithJson || undefined,
      messages: chatMessages,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.error?.message || `Anthropic HTTP ${response.status}`);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.provider = 'anthropic';
    throw err;
  }

  const content = Array.isArray(body.content)
    ? body.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
    : '';

  return {
    content: json ? extractJsonText(content) : content,
    provider: 'anthropic',
    model: anthropicModel(),
  };
}

async function callOpenAi({ userId, messages, temperature = 0.38, max_tokens = 4000, json = true }) {
  const client = await openaiService.getClient(userId);
  if (!client) {
    const err = new Error('OpenAI API key not configured');
    err.status = 400;
    throw err;
  }

  const payload = {
    model: openaiModel(),
    messages,
    temperature,
    max_tokens,
  };
  if (json) payload.response_format = { type: 'json_object' };

  const response = await client.chat.completions.create(payload);
  const content = response.choices[0]?.message?.content?.trim() || '';
  return {
    content: json ? extractJsonText(content) : content,
    provider: 'openai',
    model: openaiModel(),
  };
}

/**
 * Claude-first JSON completion with OpenAI fallback.
 * Used by resume tailor / polish / experience perfection.
 */
async function createJsonCompletion({
  userId,
  messages,
  temperature = 0.38,
  max_tokens = 4000,
  prefer = 'claude',
} = {}) {
  const preferClaude = prefer !== 'openai' && hasAnthropicKey();
  const errors = [];

  if (preferClaude) {
    try {
      return await callClaude({ messages, temperature, max_tokens, json: true });
    } catch (err) {
      errors.push(`claude: ${err.message}`);
      console.warn('[llm] Claude failed, falling back to OpenAI:', err.message);
    }
  }

  try {
    return await callOpenAi({ userId, messages, temperature, max_tokens, json: true });
  } catch (err) {
    errors.push(`openai: ${err.message}`);
    const wrapped = new Error(
      errors.length > 1
        ? `All LLM providers failed (${errors.join(' | ')})`
        : err.message || 'LLM request failed'
    );
    wrapped.status = err.status || 502;
    wrapped.errors = errors;
    throw wrapped;
  }
}

async function statusForUser(userId) {
  const openai = await openaiService.statusForUser(userId);
  const claudeConfigured = hasAnthropicKey();
  const live = claudeConfigured || openai.configured;

  return {
    configured: live,
    primaryProvider: claudeConfigured ? 'anthropic' : openai.configured ? 'openai' : null,
    fallbackProvider: claudeConfigured && openai.configured ? 'openai' : null,
    anthropic: {
      configured: claudeConfigured,
      model: anthropicModel(),
    },
    openai: {
      configured: openai.configured,
      source: openai.source,
      model: openai.model,
      keyHint: openai.keyHint,
    },
    model: claudeConfigured ? anthropicModel() : openai.model,
    features: [
      ...(claudeConfigured ? ['Resume tailoring (Claude primary)'] : []),
      ...openai.features,
    ],
  };
}

module.exports = {
  isLive,
  hasAnthropicKey,
  createJsonCompletion,
  callClaude,
  callOpenAi,
  statusForUser,
  anthropicModel,
  openaiModel,
  extractJsonText,
  splitSystemMessages,
};
