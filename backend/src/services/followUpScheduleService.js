const followUpScheduleStore = require('./followUpScheduleStore');
const notificationService = require('./notificationService');

const REMINDER_BATCH = 5;

async function scheduleForApplication(userId, job, appliedAt) {
  if (!job?.jobId) return null;
  return followUpScheduleStore.schedule(userId, job.jobId, {
    appliedAt,
    title: job.title,
    company: job.company,
  });
}

async function processDueReminders(userId) {
  const now = Date.now();
  const rows = followUpScheduleStore.listForUser(userId);
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const row of rows) {
    if (processed >= REMINDER_BATCH) break;
    if (row.reminderSent) continue;
    if (new Date(row.scheduledFor).getTime() > now) continue;
    processed += 1;

    try {
      const exists = await notificationService.hasRecentFollowUp(userId, row.jobId);
      if (!exists) {
        await notificationService.create(
          userId,
          {
            type: 'follow_up',
            title: `Follow up: ${row.title || 'application'}`,
            body: `${row.company || 'Company'} — your day-5 follow-up is ready. Open Follow-ups for your pre-drafted email and contacts.`,
            link: '/follow-ups',
            meta: { jobId: row.jobId, company: row.company, scheduled: true },
          },
          { skipPush: true }
        );
        created += 1;
      } else {
        skipped += 1;
      }
      followUpScheduleStore.markReminderSent(userId, row.jobId);
    } catch (err) {
      failed += 1;
      console.warn(`follow-up reminder skipped for ${row.jobId}:`, err.message);
    }
  }

  const dueRemaining = rows.filter(
    (r) => !r.reminderSent && new Date(r.scheduledFor).getTime() <= now
  ).length;

  return { created, skipped, failed, dueRemaining };
}

function scheduleMeta(userId, jobId) {
  const row = followUpScheduleStore.get(userId, jobId);
  if (!row) return null;
  const now = Date.now();
  const dueAt = new Date(row.scheduledFor).getTime();
  const daysUntil = Math.ceil((dueAt - now) / 86400000);
  return {
    ...row,
    daysUntil,
    isDue: dueAt <= now,
    isUpcoming: dueAt > now && daysUntil <= 2,
  };
}

module.exports = {
  scheduleForApplication,
  processDueReminders,
  scheduleMeta,
  FOLLOW_UP_DAYS: followUpScheduleStore.FOLLOW_UP_DAYS,
};
