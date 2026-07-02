const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Notification = require('../models/Notification');

describe('Notification model', () => {
  it('allows follow_up, apply_batch, and queue_job types', () => {
    const allowed = Notification.schema.path('type').enumValues;
    assert.ok(allowed.includes('follow_up'));
    assert.ok(allowed.includes('apply_batch'));
    assert.ok(allowed.includes('queue_job'));
  });
});
