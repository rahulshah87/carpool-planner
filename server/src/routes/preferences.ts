import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth } from '../auth';

const router = Router();

interface CommutePreference {
  id: string;
  user_id: string;
  direction: string;
  earliest_time: string;
  latest_time: string;
  days_of_week: string;
  role: string;
}

// Get preferences for current user
router.get('/', requireAuth, (req: Request, res: Response) => {
  const prefs = db.prepare('SELECT * FROM commute_preferences WHERE user_id = ?').all(req.user!.userId) as CommutePreference[];
  // Parse days_of_week JSON for each preference
  const parsed = prefs.map(p => ({
    ...p,
    days_of_week: JSON.parse(p.days_of_week),
  }));
  res.json(parsed);
});

// Upsert preference (by direction)
router.put('/', requireAuth, (req: Request, res: Response) => {
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

  const daysJson = JSON.stringify(days_of_week);
  const userId = req.user!.userId;

  const existing = db.prepare(
    'SELECT id FROM commute_preferences WHERE user_id = ? AND direction = ?'
  ).get(userId, direction) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      'UPDATE commute_preferences SET earliest_time = ?, latest_time = ?, days_of_week = ?, role = ? WHERE id = ?'
    ).run(earliest_time, latest_time, daysJson, role, existing.id);
  } else {
    const id = uuidv4();
    db.prepare(
      'INSERT INTO commute_preferences (id, user_id, direction, earliest_time, latest_time, days_of_week, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, userId, direction, earliest_time, latest_time, daysJson, role);
  }

  const prefs = db.prepare('SELECT * FROM commute_preferences WHERE user_id = ?').all(userId) as CommutePreference[];
  const parsed = prefs.map(p => ({
    ...p,
    days_of_week: JSON.parse(p.days_of_week),
  }));
  res.json(parsed);
});

// Delete a preference
router.delete('/:direction', requireAuth, (req: Request, res: Response) => {
  const { direction } = req.params;
  db.prepare('DELETE FROM commute_preferences WHERE user_id = ? AND direction = ?').run(req.user!.userId, direction);
  res.json({ ok: true });
});

export default router;
