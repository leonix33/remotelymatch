const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { loadKeyVaultSecrets } = require('./config/keyVault');

async function ensureAdmin({ env, User, teamService }) {
  if (!env.mongoUri) return;
  if (!env.adminEmail || !env.adminPassword) return;
  const email = env.adminEmail.toLowerCase();
  const passwordHash = await bcrypt.hash(env.adminPassword, 10);
  const forcePasswordSync = process.env.ADMIN_PASSWORD_FORCE_SYNC === '1';
  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = 'admin';
    existing.active = true;
    if (forcePasswordSync) {
      existing.passwordHash = passwordHash;
      console.log('Admin password synced from environment (ADMIN_PASSWORD_FORCE_SYNC=1)');
    }
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

async function bootstrapData({ env, conferenceService, jobService, User, teamService }) {
  if (!env.mongoUri) return;
  await ensureAdmin({ env, User, teamService });
  try {
    const synced = await jobService.syncJobsToMongo();
    console.log(`Synced ${synced} jobs from agent SQLite`);
  } catch (err) {
    console.warn('SQLite sync skipped:', err.message);
  }
  await conferenceService.ensureSeed();
}

async function start() {
  const secretLoad = await loadKeyVaultSecrets();
  if (secretLoad.provider && secretLoad.provider !== 'env') {
    console.log(
      `Secrets loaded from ${secretLoad.provider}: ${secretLoad.loaded}`
    );
  }

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

  if (env.mongoUri) {
    const mongoConnected = await connectDb();
    if (!mongoConnected) {
      env.mongoUri = '';
    }
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

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`${env.appName} running on port ${env.port} (HTTP + WebSocket)`);
    startReminderCron();
    startWeeklyPulseCron();
    bootstrapData({ env, conferenceService, jobService, User, teamService }).catch((err) => {
      console.warn('Background bootstrap failed:', err.message);
    });
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
