const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rankContacts, pickBestRecipient, isGenericInbox } = require('../services/contactRankingService');

describe('contact ranking', () => {
  it('prefers verified recruiters over generic inboxes', () => {
    const ranked = rankContacts([
      { email: 'jobs@lemon.io', role: 'jobs', source: 'hunter.io', verified: true, confidence: 'high' },
      { email: 'talent@lemon.io', name: 'Alex Recruiter', role: 'Technical Recruiter', source: 'apollo.io', verified: true, confidence: 'high' },
      { email: 'ceo@lemon.io', name: 'CEO', role: 'CEO', source: 'hunter.io', verified: true, confidence: 'high' },
    ]);
    assert.equal(ranked[0].email, 'talent@lemon.io');
    assert.equal(ranked[0].recommended, true);
    assert.equal(isGenericInbox('jobs@lemon.io'), true);
  });

  it('pickBestRecipient returns top trusted contact', () => {
    const recipient = pickBestRecipient([
      { email: 'hello@company.com', role: 'contact', verified: false },
      { email: 'recruiter@company.com', name: 'Sam', role: 'Talent Acquisition', source: 'apollo.io', verified: true, confidence: 'high' },
    ]);
    assert.equal(recipient.email, 'recruiter@company.com');
  });
});
