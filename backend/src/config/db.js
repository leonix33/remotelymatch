const mongoose = require('mongoose');
const { mongoUri, nodeEnv } = require('./env');

async function connectDb({ allowFailure = nodeEnv === 'development' } = {}) {
  if (!mongoUri) {
    console.warn('MONGODB_URI is missing — using file/SQLite fallbacks. Run: npm run mongo:up');
    return false;
  }
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('MongoDB connected');
    return true;
  } catch (err) {
    console.error('\n❌ MongoDB connection failed:', err.message);
    if (allowFailure) {
      console.warn('   Continuing in SQLite-only dev mode (login via ADMIN_EMAIL in backend/.env)');
      console.warn('   For full Mongo features: open Docker Desktop → npm run mongo:up\n');
      return false;
    }
    console.error('   Local fix: open Docker Desktop → npm run mongo:up');
    console.error('   Or SQLite-only: clear MONGODB_URI in backend/.env\n');
    throw err;
  }
}

module.exports = connectDb;
