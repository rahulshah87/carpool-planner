import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import rateLimit from 'express-rate-limit';

import { initDb } from './db';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import preferencesRoutes from './routes/preferences';
import matchRoutes from './routes/matches';
import interestRoutes from './routes/interests';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});
const computeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Match computation rate limit exceeded, please wait before trying again.' },
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/matches/compute', computeLimiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/interests', interestRoutes);

// Health check
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Config endpoint (exposes Maps API key to frontend)
app.get('/api/config', (_req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    workplaceName: process.env.WORKPLACE_NAME || "Epic Systems",
    workplaceAddress: process.env.WORKPLACE_ADDRESS || "1979 Milky Way, Verona, WI 53593",
  });
});

// Serve React static files in production
const clientBuildPath = path.join(__dirname, '..', 'public');
app.use(express.static(clientBuildPath));

// SPA fallback — serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Start server first (so Cloud Run sees a listening port), then initialize database
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Initialize database with retries for transient Cloud SQL connection issues
  const maxRetries = 5;
  const retryDelay = 3000;

  (async function tryInitDb(attempt: number) {
    try {
      await initDb();
      console.log('Database initialized successfully');
    } catch (err) {
      console.error(`Database init attempt ${attempt}/${maxRetries} failed:`, err);
      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryDelay / 1000}s...`);
        setTimeout(() => tryInitDb(attempt + 1), retryDelay);
      } else {
        console.error('All database init attempts failed. Exiting.');
        process.exit(1);
      }
    }
  })(1);
});

export { app };
