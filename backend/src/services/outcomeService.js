const Outcome = require('../models/Outcome');
const env = require('../config/env');
const openaiService = require('./openaiService');
const localOutcomeStore = require('./localOutcomeStore');
const { getConversionContext, invalidateConversionContext } = require('./conversionStatsService');

async function upsert(userId, data) {
  let saved;
  if (!env.mongoUri) {
    saved = localOutcomeStore.upsert(userId, data);
  } else {
    saved = await Outcome.findOneAndUpdate(
      { userId, jobId: data.jobId },
      { userId, ...data },
      { upsert: true, new: true }
    );
  }
  invalidateConversionContext(userId);
  return saved;
}

async function list(userId) {
  if (!env.mongoUri) {
    return localOutcomeStore.list(userId);
  }
  return Outcome.find({ userId }).sort({ updatedAt: -1 }).lean();
}

async function insights(userId) {
  const outcomes = await list(userId);
  const total = outcomes.length;
  const offers = outcomes.filter((o) => o.stage === 'offer').length;
  const onsites = outcomes.filter((o) => o.stage === 'onsite' || o.stage === 'screen').length;
  const applied = outcomes.filter((o) => o.stage === 'applied').length;
  const avgMatch =
    outcomes.filter((o) => o.matchPct).reduce((s, o) => s + o.matchPct, 0) /
      (outcomes.filter((o) => o.matchPct).length || 1);

  const conversion = getConversionContext(userId);
  const topSources = Object.entries(conversion.sourceReplyRates || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, rate]) => ({ source, replyRatePct: Math.round(rate * 100) }));

  let aiInsight = 'Track more outcomes to unlock AI learning.';
  const live = await openaiService.isLive(userId);
  if (live && total >= 3) {
    const generated = await openaiService.chatCompletion(userId, {
      messages: [
        { role: 'system', content: 'Analyze job search outcomes. Give 3 actionable insights in bullet points.' },
        {
          role: 'user',
          content: JSON.stringify({
            total,
            offers,
            onsites,
            applied,
            avgMatch,
            topSources,
            stages: outcomes.map((o) => o.stage),
          }),
        },
      ],
      max_tokens: 300,
    });
    aiInsight = generated || aiInsight;
  }

  return {
    stats: { total, offers, onsites, applied, avgMatch: Math.round(avgMatch) },
    conversionRate: total ? Math.round((offers / total) * 100) : 0,
    replyRatePct: Math.round((conversion.userReplyRate || 0.06) * 100),
    topSources,
    aiInsight,
  };
}

module.exports = { upsert, list, insights };
