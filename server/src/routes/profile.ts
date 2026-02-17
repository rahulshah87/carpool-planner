import { Router, Request, Response } from 'express';
import db from '../db';
import { requireAuth } from '../auth';

const router = Router();

// Get profile
router.get('/', requireAuth, (req: Request, res: Response) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// Update profile (home address + geocoded coordinates)
router.put('/', requireAuth, async (req: Request, res: Response) => {
  const { home_address, home_lat, home_lng } = req.body;

  // If address provided but no coordinates, geocode it
  let lat = home_lat;
  let lng = home_lng;

  if (home_address && (!lat || !lng)) {
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      const encoded = encodeURIComponent(home_address);
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`
      );
      const data = await resp.json() as any;
      if (data.results && data.results.length > 0) {
        lat = data.results[0].geometry.location.lat;
        lng = data.results[0].geometry.location.lng;
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  }

  db.prepare(
    `UPDATE users SET home_address = ?, home_lat = ?, home_lng = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(home_address || null, lat || null, lng || null, req.user!.userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId);
  res.json(user);
});

export default router;
