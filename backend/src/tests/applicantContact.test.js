const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveContactEmail,
  resolveNotificationRecipients,
  isAppOrSystemEmail,
  isMailboxOnlyEmail,
} = require('../services/applicantContactService');

describe('applicantContactService', () => {
  it('prefers personal digestEmail over admin email', () => {
    const email = resolveContactEmail(
      { digestEmail: 'leonix23@gmail.com' },
      'admin@example.com'
    );
    assert.equal(email, 'leonix23@gmail.com');
  });

  it('flags app/system emails', () => {
    assert.equal(isAppOrSystemEmail('admin@example.com'), true);
    assert.equal(isAppOrSystemEmail('user@personal-mail.test'), false);
    assert.equal(isMailboxOnlyEmail('noreply@remotelymatch.app'), true);
  });

  it('collects personal notification recipients without duplicates', () => {
    const recipients = resolveNotificationRecipients(
      { digestEmail: 'leonix23@gmail.com', notificationEmail: 'work@company.com' },
      'leonix23@gmail.com'
    );
    assert.deepEqual(recipients, ['leonix23@gmail.com', 'work@company.com']);
  });

  it('allows admin gmail as a personal notification address', () => {
    const recipients = resolveNotificationRecipients({}, 'leonix23@gmail.com');
    assert.deepEqual(recipients, ['leonix23@gmail.com']);
  });
});
