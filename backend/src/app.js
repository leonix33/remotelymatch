const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const agentRoutes = require('./routes/agentRoutes');
const generationRoutes = require('./routes/generationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const syncRoutes = require('./routes/syncRoutes');
const profileRoutes = require('./routes/profileRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const aiRoutes = require('./routes/aiRoutes');
const chatRoutes = require('./routes/chatRoutes');
const intelligenceRoutes = require('./routes/intelligenceRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const socialRoutes = require('./routes/socialRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const outcomeRoutes = require('./routes/outcomeRoutes');
const conferenceRoutes = require('./routes/conferenceRoutes');
const swarmRoutes = require('./routes/swarmRoutes');
const resumeCommunityRoutes = require('./routes/resumeCommunityRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const teamRoutes = require('./routes/teamRoutes');
const pushRoutes = require('./routes/pushRoutes');
const linkedinVisibilityRoutes = require('./routes/linkedinVisibilityRoutes');
const tractionRoutes = require('./routes/tractionRoutes');
const conciergeRoutes = require('./routes/conciergeRoutes');
const setupRoutes = require('./routes/setupRoutes');
const observabilityRoutes = require('./routes/observabilityRoutes');
const { buildHealthBase } = require('./controllers/setupController');
const { CANONICAL_DOMAIN, LEGACY_REDIRECT_HOSTS } = require('./config/domains');

function createApp() {
  const app = express();

  const canonicalHost = (env.customDomain || CANONICAL_DOMAIN).replace(/^https?:\/\//, '').toLowerCase();

  app.use((req, res, next) => {
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (LEGACY_REDIRECT_HOSTS.has(host) && canonicalHost) {
      return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
    }
    next();
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
        if (env.customDomain && origin.includes(env.customDomain.replace(/^https?:\/\//, ''))) {
          return callback(null, true);
        }
        callback(null, env.clientOrigins[0] || true);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(morgan('dev'));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

  app.get('/api/health', async (req, res, next) => {
    try {
      res.json(await buildHealthBase());
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/generations', generationRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/approvals', approvalRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/intelligence', intelligenceRoutes);
  app.use('/api/interview', interviewRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/outcomes', outcomeRoutes);
  app.use('/api/conferences', conferenceRoutes);
  app.use('/api/swarm', swarmRoutes);
  app.use('/api/resumes', resumeCommunityRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api/linkedin/visibility', linkedinVisibilityRoutes);
  app.use('/api/traction', tractionRoutes);
  app.use('/api/concierge', conciergeRoutes);
  app.use('/api/setup', setupRoutes);
  app.use('/api/admin/observability', observabilityRoutes);

  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) res.status(404).send('Frontend not built. Run npm run build.');
    });
  });

  app.use((err, req, res, next) => {
    const status = err.status || (err.name === 'ZodError' ? 400 : 500);
    res.status(status).json({ message: err.message || 'Server error' });
  });

  return app;
}

module.exports = createApp;
