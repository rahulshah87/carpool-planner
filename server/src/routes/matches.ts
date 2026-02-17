import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth } from '../auth';

const router = Router();

// Workplace destination (Epic's Verona campus)
const WORK_LAT = parseFloat(process.env.WORK_LAT || '42.9914');
const WORK_LNG = parseFloat(process.env.WORK_LNG || '-89.5326');

interface User {
  id: string;
  display_name: string;
  home_lat: number | null;
  home_lng: number | null;
  home_address: string | null;
}

interface Preference {
  user_id: string;
  direction: string;
  earliest_time: string;
  latest_time: string;
  days_of_week: string;
  role: string;
}

// Haversine distance in miles
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Parse HH:MM time to minutes since midnight
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Schedule overlap in minutes
function computeOverlap(
  earliest1: string, latest1: string, days1: number[],
  earliest2: string, latest2: string, days2: number[]
): { overlapMinutes: number; commonDays: number[] } {
  const commonDays = days1.filter(d => days2.includes(d));
  if (commonDays.length === 0) return { overlapMinutes: 0, commonDays: [] };

  const start = Math.max(timeToMinutes(earliest1), timeToMinutes(earliest2));
  const end = Math.min(timeToMinutes(latest1), timeToMinutes(latest2));
  const overlapMinutes = Math.max(0, end - start);

  return { overlapMinutes, commonDays };
}

// Check role compatibility
function rolesCompatible(role1: string, role2: string): boolean {
  if (role1 === 'RIDER' && role2 === 'RIDER') return false;
  return true;
}

// Get matches for current user
router.get('/', requireAuth, (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const matches = db.prepare(`
    SELECT mr.*,
      CASE WHEN mr.user_a_id = ? THEN u2.display_name ELSE u1.display_name END as partner_name,
      CASE WHEN mr.user_a_id = ? THEN u2.avatar_url ELSE u1.avatar_url END as partner_avatar,
      CASE WHEN mr.user_a_id = ? THEN u2.home_address ELSE u1.home_address END as partner_address,
      CASE WHEN mr.user_a_id = ? THEN mr.user_b_id ELSE mr.user_a_id END as partner_id
    FROM match_results mr
    JOIN users u1 ON mr.user_a_id = u1.id
    JOIN users u2 ON mr.user_b_id = u2.id
    WHERE mr.user_a_id = ? OR mr.user_b_id = ?
    ORDER BY mr.rank_score ASC
  `).all(userId, userId, userId, userId, userId, userId);

  // Generalize addresses for privacy (city only)
  const sanitized = matches.map((m: any) => ({
    ...m,
    partner_address: m.partner_address
      ? m.partner_address.split(',').slice(-2).join(',').trim()
      : null,
  }));

  res.json(sanitized);
});

// Compute matches for the current user
router.post('/compute', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
  if (!currentUser?.home_lat || !currentUser?.home_lng) {
    res.status(400).json({ error: 'Please set your home address first' });
    return;
  }

  const myPrefs = db.prepare('SELECT * FROM commute_preferences WHERE user_id = ?').all(userId) as Preference[];
  if (myPrefs.length === 0) {
    res.status(400).json({ error: 'Please set your commute preferences first' });
    return;
  }

  // Get all other users with addresses
  const otherUsers = db.prepare(
    'SELECT * FROM users WHERE id != ? AND home_lat IS NOT NULL AND home_lng IS NOT NULL'
  ).all(userId) as User[];

  // Clear old matches for this user
  db.prepare('DELETE FROM match_results WHERE user_a_id = ? OR user_b_id = ?').run(userId, userId);

  const DETOUR_THRESHOLD = parseFloat(process.env.DETOUR_THRESHOLD_MIN || '15');
  const DISTANCE_THRESHOLD = parseFloat(process.env.DISTANCE_THRESHOLD_MI || '30');
  const W_DETOUR = 1.0;
  const W_OVERLAP = 0.5;

  const newMatches: any[] = [];

  for (const other of otherUsers) {
    // Distance pre-filter
    const dist = haversine(currentUser.home_lat!, currentUser.home_lng!, other.home_lat!, other.home_lng!);
    if (dist > DISTANCE_THRESHOLD) continue;

    const otherPrefs = db.prepare('SELECT * FROM commute_preferences WHERE user_id = ?').all(other.id) as Preference[];

    for (const myPref of myPrefs) {
      for (const otherPref of otherPrefs) {
        // Must be same direction
        if (myPref.direction !== otherPref.direction) continue;

        // Role compatibility
        if (!rolesCompatible(myPref.role, otherPref.role)) continue;

        // Schedule overlap
        const myDays = JSON.parse(myPref.days_of_week);
        const otherDays = JSON.parse(otherPref.days_of_week);
        const { overlapMinutes, commonDays } = computeOverlap(
          myPref.earliest_time, myPref.latest_time, myDays,
          otherPref.earliest_time, otherPref.latest_time, otherDays
        );

        if (overlapMinutes === 0 || commonDays.length === 0) continue;

        // Estimate detour using haversine (rough approximation)
        // Real implementation would use Google Distance Matrix API
        const directToWork = haversine(currentUser.home_lat!, currentUser.home_lng!, WORK_LAT, WORK_LNG);
        const viaOther = haversine(currentUser.home_lat!, currentUser.home_lng!, other.home_lat!, other.home_lng!)
          + haversine(other.home_lat!, other.home_lng!, WORK_LAT, WORK_LNG);
        const detourMiles = viaOther - directToWork;
        // Rough conversion: 1 mile ≈ 2 minutes in suburban driving
        const detourMinutes = Math.max(0, detourMiles * 2);

        if (detourMinutes > DETOUR_THRESHOLD) continue;

        const rankScore = (detourMinutes * W_DETOUR) - (overlapMinutes * W_OVERLAP);

        const matchId = uuidv4();
        db.prepare(
          `INSERT INTO match_results (id, user_a_id, user_b_id, direction, detour_minutes, time_overlap_minutes, rank_score)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(matchId, userId, other.id, myPref.direction, detourMinutes, overlapMinutes, rankScore);

        newMatches.push({
          id: matchId,
          partner_name: other.display_name,
          direction: myPref.direction,
          detour_minutes: Math.round(detourMinutes * 10) / 10,
          time_overlap_minutes: overlapMinutes,
          rank_score: Math.round(rankScore * 10) / 10,
        });
      }
    }
  }

  newMatches.sort((a, b) => a.rank_score - b.rank_score);
  res.json({ computed: newMatches.length, matches: newMatches });
});

export default router;
