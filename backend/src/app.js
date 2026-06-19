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

function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(morgan('dev'));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

  app.get('/api/health', (req, res) => {
    const email = env.adminEmail || '';
    res.json({
      ok: true,
      appName: env.appName,
      appUrl: env.appUrl,
      environment: env.nodeEnv,
      deployTag: env.deployTag,
      adminConfigured: Boolean(email && env.adminPassword),
      adminEmailHint: email.includes('@') ? `${email.split('@')[0].slice(0, 3)}***@${email.split('@')[1]}` : 'unset',
      time: new Date().toISOString(),
    });
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
    const status = err.name === 'ZodError' ? 400 : 400;
    res.status(status).json({ message: err.message || 'Server error' });
  });

  return app;
}

module.exports = createApp;
