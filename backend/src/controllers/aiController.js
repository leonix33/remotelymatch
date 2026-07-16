const { z } = require('zod');
const aiCoachService = require('../services/aiCoachService');
const openaiService = require('../services/openaiService');
const llmService = require('../services/llmService');
const teamService = require('../services/teamService');

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
});

async function send(req, res, next) {
  try {
    await teamService.checkLimit(req.user.sub, 'ai');
    const body = chatSchema.parse(req.body);
    const result = await aiCoachService.chat(req.user.sub, body.message);
    await teamService.incrementUsage(req.user.sub, 'ai');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const messages = await aiCoachService.getHistory(req.user.sub);
    res.json(messages);
  } catch (err) {
    next(err);
  }
}

async function clear(req, res, next) {
  try {
    await aiCoachService.clearHistory(req.user.sub);
    res.json({ message: 'History cleared' });
  } catch (err) {
    next(err);
  }
}

async function status(req, res, next) {
  try {
    const data = await llmService.statusForUser(req.user.sub);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { send, history, clear, status };
