import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';

import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import preferencesRoutes from './routes/preferences';
import matchRoutes from './routes/matches';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/matches', matchRoutes);

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
