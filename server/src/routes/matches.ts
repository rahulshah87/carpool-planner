import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAuth } from '../auth';

const router = Router();

// Workplace destination (Epic's Verona campus)
const WORK_LAT = parseFloat(process.env.WORK_LAT || '42.9914');
const WORK_LNG = parseFloat(process.env.WORK_LNG || '-89.5326');

// Haversine distance in miles
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Schedule overlap in minutes
export function computeOverlap(
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
export function rolesCompatible(role1: string, role2: string): boolean {
  if (role1 === 'RIDER' && role2 === 'RIDER') return false;
  return true;
}

// Call Google Distance Matrix API for a batch of origins → destinations.
// Returns durations in minutes, or null if the API is unavailable.
async function getDistanceMatrixMinutes(
  origins: Array<{ lat: number; lng: number }>,
  destinations: Array<{ lat: number; lng: number }>,
  apiKey: string,
): Promise<number[][] | null> {
  const originsStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
  const destsStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(originsStr)}` +
    `&destinations=${encodeURIComponent(destsStr)}` +
    `&key=${apiKey}`;

  const resp = await fetch(url);
  const data = await resp.json() as any;
  if (data.status !== 'OK') return null;

  return data.rows.map((row: any) =>
    row.elements.map((el: any) =>
      el.status === 'OK' ? el.duration.value / 60 : null
    )
  );
}

// Get matches for current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { rows: matches } = await pool.query(`
    SELECT mr.*,
      CASE WHEN mr.user_a_id = $1 THEN u2.display_name ELSE u1.display_name END as partner_name,
      CASE WHEN mr.user_a_id = $1 THEN u2.avatar_url ELSE u1.avatar_url END as partner_avatar,
      CASE WHEN mr.user_a_id = $1 THEN u2.home_neighborhood ELSE u1.home_neighborhood END as partner_neighborhood,
      CASE WHEN mr.user_a_id = $1 THEN mr.user_b_id ELSE mr.user_a_id END as partner_id,
      EXISTS(
        SELECT 1 FROM interests i
        WHERE i.from_user_id = $1
          AND i.to_user_id = CASE WHEN mr.user_a_id = $1 THEN mr.user_b_id ELSE mr.user_a_id END
          AND i.direction = mr.direction
      ) as i_expressed_interest,
      EXISTS(
        SELECT 1 FROM interests i
        WHERE i.from_user_id = CASE WHEN mr.user_a_id = $1 THEN mr.user_b_id ELSE mr.user_a_id END
          AND i.to_user_id = $1
          AND i.direction = mr.direction
      ) as they_expressed_interest
    FROM match_results mr
    JOIN users u1 ON mr.user_a_id = u1.id
    JOIN users u2 ON mr.user_b_id = u2.id
    WHERE mr.user_a_id = $1 OR mr.user_b_id = $1
    ORDER BY mr.rank_score ASC
  `, [userId]);

  // Return neighborhood from geocoded data (no address parsing needed)
  const sanitized = matches.map(({ partner_neighborhood, ...m }: any) => ({
    ...m,
    partner_address: partner_neighborhood || null,
  }));

  res.json(sanitized);
});

// Compute matches for the current user
router.post('/compute', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const currentUser = userRows[0];
  if (!currentUser?.home_lat || !currentUser?.home_lng) {
    res.status(400).json({ error: 'Please set your home address first' });
    return;
  }

  const { rows: myPrefs } = await pool.query(
    'SELECT * FROM commute_preferences WHERE user_id = $1', [userId]
  );
  if (myPrefs.length === 0) {
    res.status(400).json({ error: 'Please set your commute preferences first' });
    return;
  }

  // Get all other users with addresses
  const { rows: otherUsers } = await pool.query(
    'SELECT * FROM users WHERE id != $1 AND home_lat IS NOT NULL AND home_lng IS NOT NULL',
    [userId]
  );

  // Clear old matches for this user
  await pool.query(
    'DELETE FROM match_results WHERE user_a_id = $1 OR user_b_id = $1', [userId]
  );

  const DETOUR_THRESHOLD = parseFloat(process.env.DETOUR_THRESHOLD_MIN || '15');
  const DISTANCE_THRESHOLD = parseFloat(process.env.DISTANCE_THRESHOLD_MI || '30');
  const W_DETOUR = 1.0;
  const W_OVERLAP = 0.5;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // Haversine pre-filter: only keep candidates within DISTANCE_THRESHOLD miles
  const candidates = otherUsers.filter(other =>
    haversine(currentUser.home_lat, currentUser.home_lng, other.home_lat, other.home_lng) <= DISTANCE_THRESHOLD
  );

  // Fetch real drive times via Distance Matrix API if available.
  // Two calls:
  //   Call 1: currentUser → [each candidate, WORK]
  //   Call 2: [each candidate] → WORK
  // This gives us driver→rider, driver→work, and rider→work times.
  let driverToRiderMin: (number | null)[] | null = null;
  let driverToWorkMin: number | null = null;
  let riderToWorkMin: (number | null)[] | null = null;

  if (apiKey && candidates.length > 0) {
    try {
      const candidatePoints = candidates.map(c => ({ lat: c.home_lat, lng: c.home_lng }));
      const workPoint = { lat: WORK_LAT, lng: WORK_LNG };

      // Call 1: currentUser → candidates + work
      const call1 = await getDistanceMatrixMinutes(
        [{ lat: currentUser.home_lat, lng: currentUser.home_lng }],
        [...candidatePoints, workPoint],
        apiKey
      );
      if (call1) {
        driverToRiderMin = call1[0].slice(0, candidates.length);
        driverToWorkMin = call1[0][candidates.length];
      }

      // Call 2: candidates → work
      const call2 = await getDistanceMatrixMinutes(candidatePoints, [workPoint], apiKey);
      if (call2) {
        riderToWorkMin = call2.map(row => row[0]);
      }
    } catch (err) {
      console.error('Distance Matrix API error, falling back to Haversine:', err);
    }
  }

  const newMatches: any[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const other = candidates[i];

    const { rows: otherPrefs } = await pool.query(
      'SELECT * FROM commute_preferences WHERE user_id = $1', [other.id]
    );

    // Real drive times from Distance Matrix (if available), else Haversine fallback
    let detourMinutes: number;
    if (
      driverToRiderMin && driverToWorkMin !== null && riderToWorkMin &&
      driverToRiderMin[i] !== null && riderToWorkMin[i] !== null
    ) {
      detourMinutes = Math.max(0, driverToRiderMin[i]! + riderToWorkMin[i]! - driverToWorkMin);
    } else {
      const directToWork = haversine(currentUser.home_lat, currentUser.home_lng, WORK_LAT, WORK_LNG);
      const viaOther =
        haversine(currentUser.home_lat, currentUser.home_lng, other.home_lat, other.home_lng) +
        haversine(other.home_lat, other.home_lng, WORK_LAT, WORK_LNG);
      detourMinutes = Math.max(0, (viaOther - directToWork) * 2); // ~2 min/mile suburban
    }

    if (detourMinutes > DETOUR_THRESHOLD) continue;

    for (const myPref of myPrefs) {
      for (const otherPref of otherPrefs) {
        if (myPref.direction !== otherPref.direction) continue;
        if (!rolesCompatible(myPref.role, otherPref.role)) continue;

        const myDays: number[] = myPref.days_of_week;
        const otherDays: number[] = otherPref.days_of_week;
        const { overlapMinutes, commonDays } = computeOverlap(
          myPref.earliest_time, myPref.latest_time, myDays,
          otherPref.earliest_time, otherPref.latest_time, otherDays
        );

        if (overlapMinutes === 0 || commonDays.length === 0) continue;

        const rankScore = (detourMinutes * W_DETOUR) - (overlapMinutes * W_OVERLAP);

        const matchId = uuidv4();
        await pool.query(
          `INSERT INTO match_results (id, user_a_id, user_b_id, direction, detour_minutes, time_overlap_minutes, rank_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [matchId, userId, other.id, myPref.direction, detourMinutes, overlapMinutes, rankScore]
        );

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
