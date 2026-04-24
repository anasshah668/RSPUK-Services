import mongoose from 'mongoose';

const readyStateConnected = 1;

/**
 * Blocks API traffic when the default Mongoose connection is not connected.
 * Use after `await connectDB()` on boot, or together with per-request `await connectDB()`
 * on serverless so the first await establishes the socket.
 *
 * Skips GET /api/health so orchestration / load balancers can still probe liveness.
 */
export function requireDatabase(req, res, next) {
  const url = req.originalUrl || '';
  if (req.method === 'GET' && /^\/api\/health(\/|$|\?)/.test(url)) {
    return next();
  }

  if (mongoose.connection.readyState === readyStateConnected) {
    return next();
  }

  const state = mongoose.connection.readyState;
  const labels = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const label = labels[state] ?? String(state);

  return res.status(503).json({
    ok: false,
    error: 'Database temporarily unavailable',
    dbState: label,
  });
}
