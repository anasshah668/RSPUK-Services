import mongoose from 'mongoose';

/**
 * Fail fast instead of queueing operations while disconnected (prevents
 * "Operation `…` buffering timed out after 10000ms" surprises).
 */
mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

const globalForMongoose = globalThis;

/** Reuse one connection across Vercel serverless warm invocations. */
const cached =
  globalForMongoose.__rspukMongoose ??
  (globalForMongoose.__rspukMongoose = { conn: null, promise: null, eventsBound: false });

const isVercel = process.env.VERCEL === '1';

const defaultOptions = {
  /** How long to try selecting a server before error (fail-fast vs hanging). */
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10_000,
  /** Max time to wait for initial TCP handshake. */
  connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10_000,
  /** How long a send/receive on a socket may idle before the driver closes it. */
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45_000,
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 0,
  /** Optional: prefer IPv4 on some networks where IPv6 causes flaky Atlas routing. */
  ...(process.env.MONGO_FORCE_IPV4 === '1' ? { family: 4 } : {}),
};

function bindConnectionEventsOnce() {
  if (cached.eventsBound) return;
  cached.eventsBound = true;

  const conn = mongoose.connection;

  conn.on('connecting', () => {
    console.log('[mongo] connecting…');
  });

  conn.on('connected', () => {
    console.log('[mongo] connected (driver connected to primary/replica)');
  });

  conn.on('open', () => {
    console.log('[mongo] ready — connection open');
  });

  conn.on('disconnected', () => {
    console.warn('[mongo] disconnected');
  });

  conn.on('close', () => {
    console.warn('[mongo] connection closed');
  });

  conn.on('error', (err) => {
    console.error('[mongo] connection error:', err?.message || err);
  });
}

/**
 * Connect to MongoDB (idempotent). Safe for long-running servers and Vercel.
 * @returns {Promise<typeof mongoose|null>}
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri && isVercel) {
    console.error(
      '[mongo] MONGODB_URI is not set. Add your Atlas URI in Vercel → Environment Variables.'
    );
    return null;
  }

  const target = uri || 'mongodb://localhost:27017/printing-platform';

  bindConnectionEventsOnce();

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(target, defaultOptions).then(() => mongoose);
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    cached.conn = null;
    console.error('[mongo] connection failed:', error?.message || error);
    throw error;
  }
};

/** @returns {boolean} */
export const isDbConnected = () => mongoose.connection.readyState === 1;

/** @returns {import('mongoose').ConnectionStates} */
export const getDbReadyState = () => mongoose.connection.readyState;

/** Graceful shutdown (tests, SIGTERM handlers). */
export async function disconnectDB() {
  await mongoose.connection.close();
  cached.conn = null;
  cached.promise = null;
}

export default connectDB;
