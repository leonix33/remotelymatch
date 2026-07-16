const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractJsonText,
  splitSystemMessages,
  hasAnthropicKey,
} = require('../services/llmService');

describe('llmService', () => {
  it('extracts JSON from fenced Claude responses', () => {
    const raw = 'Here you go:\n```json\n{"summary":"Platform engineer","experience":"..."}\n```\n';
    const json = extractJsonText(raw);
    assert.ok(json.startsWith('{'));
    assert.ok(json.includes('"summary"'));
    assert.doesNotThrow(() => JSON.parse(json));
  });

  it('extracts bare JSON objects', () => {
    const raw = 'prefix {"a":1,"b":2} trailing';
    assert.equal(extractJsonText(raw), '{"a":1,"b":2}');
  });

  it('splits system messages for Anthropic Messages API', () => {
    const { system, messages } = splitSystemMessages([
      { role: 'system', content: 'You are an ATS optimizer.' },
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: 'Rewrite summary' },
    ]);
    assert.match(system, /ATS optimizer/);
    assert.match(system, /Return JSON only/);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, 'user');
  });

  it('reports anthropic key presence from env without crashing', () => {
    assert.equal(typeof hasAnthropicKey(), 'boolean');
  });
});
