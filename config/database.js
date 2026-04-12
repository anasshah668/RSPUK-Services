import mongoose from 'mongoose';

const globalForMongoose = globalThis;

/** Reuse one connection across Vercel serverless invocations (warm starts). */
const cached =
  globalForMongoose.__rspukMongoose ??
  (globalForMongoose.__rspukMongoose = { conn: null, promise: null });

const isVercel = process.env.VERCEL === '1';

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri && isVercel) {
    console.error('[db] MONGODB_URI is not set. Add your MongoDB Atlas connection string in Vercel → Settings → Environment Variables.');
    return null;
  }

  const target = uri || 'mongodb://localhost:27017/printing-platform';

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(target).then(() => mongoose);
  }

  try {
    cached.conn = await cached.promise;
    if (cached.conn?.connection?.host) {
      console.log(`MongoDB Connected: ${cached.conn.connection.host}`);
    }
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    console.error(`[db] ${error.message}`);
    if (!isVercel) {
      process.exit(1);
    }
    return null;
  }
};

export default connectDB;
