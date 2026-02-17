import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAuth } from '../auth';

const router = Router();

// Get preferences for current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    'SELECT * FROM commute_preferences WHERE user_id = $1', [req.user!.userId]
  );
  res.json(rows);
});

// Upsert preference (by direction)
router.put('/', requireAuth, async (req: Request, res: Response) => {
  const { direction, earliest_time, latest_time, days_of_week, role } = req.body;

  if (!direction || !earliest_time || !latest_time || !days_of_week || !role) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  if (!['TO_WORK', 'FROM_WORK'].includes(direction)) {
    res.status(400).json({ error: 'Invalid direction' });
    return;
  }

  if (!['DRIVER', 'RIDER', 'EITHER'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  if (!Array.isArray(days_of_week) || days_of_week.length === 0) {
    res.status(400).json({ error: 'Select at least one day' });
    return;
  }

  // Validate time format and ordering
  const timeRe = /^\d{2}:\d{2}$/;
  if (!timeRe.test(earliest_time) || !timeRe.test(latest_time)) {
    res.status(400).json({ error: 'Invalid time format' });
    return;
  }
  const [eh, em] = earliest_time.split(':').map(Number);
  const [lh, lm] = latest_time.split(':').map(Number);
  if (lh * 60 + lm <= eh * 60 + em) {
    res.status(400).json({ error: 'Latest departure must be after earliest departure' });
    return;
  }

  const daysJson = JSON.stringify(days_of_week);
  const userId = req.user!.userId;

  const { rows: existing } = await pool.query(
    'SELECT id FROM commute_preferences WHERE user_id = $1 AND direction = $2',
    [userId, direction]
  );

  if (existing.length > 0) {
    await pool.query(
      'UPDATE commute_preferences SET earliest_time = $1, latest_time = $2, days_of_week = $3, role = $4 WHERE id = $5',
      [earliest_time, latest_time, daysJson, role, existing[0].id]
    );
  } else {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO commute_preferences (id, user_id, direction, earliest_time, latest_time, days_of_week, role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, userId, direction, earliest_time, latest_time, daysJson, role]
    );
  }

  const { rows } = await pool.query(
    'SELECT * FROM commute_preferences WHERE user_id = $1', [userId]
  );
  res.json(rows);
});

// Delete a preference
router.delete('/:direction', requireAuth, async (req: Request, res: Response) => {
  const { direction } = req.params;
  await pool.query(
    'DELETE FROM commute_preferences WHERE user_id = $1 AND direction = $2',
    [req.user!.userId, direction]
  );
  res.json({ ok: true });
});

export default router;
