const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const connectDb = require('./config/db');
const env = require('./config/env');
const createApp = require('./app');
const User = require('./models/User');
const jobService = require('./services/jobService');
const { initSocket } = require('./socket');
const conferenceService = require('./services/conferenceService');
const { startReminderCron } = require('./services/reminderService');
const { startWeeklyPulseCron } = require('./services/weeklyPulseService');
const teamService = require('./services/teamService');

async function ensureAdmin() {
  if (!env.mongoUri) return;
  if (!env.adminEmail || !env.adminPassword) return;
  const email = env.adminEmail.toLowerCase();
  const passwordHash = await bcrypt.hash(env.adminPassword, 10);
  const existing = await User.findOne({ email });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.active = true;
    await existing.save();
    await teamService.ensureTeamForUser(existing);
    console.log('Admin user synced from environment');
    return;
  }
  const user = await User.create({
    name: 'Admin',
    email,
    role: 'admin',
    passwordHash,
  });
  await teamService.ensureTeamForUser(user);
  console.log('Admin user created');
}

async function start() {
  if (env.mongoUri) {
    await connectDb();
    await ensureAdmin();
    try {
      const synced = await jobService.syncJobsToMongo();
      const apps = await jobService.syncApplicationsToMongo();
      console.log(`Synced ${synced} jobs and ${apps} applications from agent SQLite`);
    } catch (err) {
      console.warn('SQLite sync skipped:', err.message);
    }
    await conferenceService.ensureSeed();
  } else {
    console.warn('MONGODB_URI not set — running in SQLite-only mode (read-only from agent DBs)');
  }

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: env.clientOrigins, credentials: true },
    path: '/socket.io',
  });
  initSocket(io);

  server.listen(env.port, () => {
    console.log(`${env.appName} running on port ${env.port} (HTTP + WebSocket)`);
    startReminderCron();
    startWeeklyPulseCron();
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
