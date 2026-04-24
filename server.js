import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import passport from 'passport';
import connectDB, { isDbConnected, getDbReadyState, disconnectDB } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import categoryRoutes from './routes/category.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import thirdPartyRoutes from './routes/thirdParty.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import cartRoutes from './routes/cart.routes.js';
import neonPricingRoutes from './routes/neonPricing.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireDatabase } from './middleware/requireDatabase.js';

const app = express();
const isVercel = process.env.VERCEL === '1';

// Middleware - Allow CORS from anywhere
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Id', 'X-Requested-With'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

/**
 * Serverless: no `listen()` — ensure a socket exists before route handlers run.
 * Long-running: redundant after boot `await connectDB()` but keeps warm paths safe.
 */
if (isVercel) {
  app.use(async (req, res, next) => {
    try {
      const conn = await connectDB();
      if (!conn) {
        return res.status(503).json({
          ok: false,
          error: 'Database not configured',
          hint: 'Set MONGODB_URI in Vercel environment variables.',
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });
}

// Liveness / readiness info (does not require DB for HTTP 200 — see `database` field)
app.get('/api/health', (req, res) => {
  const connected = isDbConnected();
  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.status(200).json({
    status: 'OK',
    message: 'Server process is running',
    database: {
      connected,
      readyState: getDbReadyState(),
      readyStateName: stateNames[getDbReadyState()] ?? 'unknown',
    },
  });
});

app.use(requireDatabase);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/third-party', thirdPartyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/neon-pricing', neonPricingRoutes);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  if (isVercel) {
    return;
  }

  try {
    await connectDB();
    if (!isDbConnected()) {
      throw new Error('MongoDB did not reach connected state after connect()');
    }
  } catch (err) {
    console.error('[bootstrap] Cannot start API without MongoDB:', err?.message || err);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT} (MongoDB connected)`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down…`);
    server.close(async () => {
      try {
        await disconnectDB();
        console.log('[mongo] driver disconnected cleanly');
      } catch (e) {
        console.error('[mongo] error during disconnect:', e?.message || e);
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap();

export default app;
