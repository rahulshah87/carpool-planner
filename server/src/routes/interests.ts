import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAuth } from '../auth';
import { sendInterestEmail } from '../email';

const router = Router();

// Express interest in a user for a given direction
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const fromUserId = req.user!.userId;
  const { to_user_id, direction } = req.body;

  if (!to_user_id || !direction) {
    res.status(400).json({ error: 'to_user_id and direction are required' });
    return;
  }
  if (!['TO_WORK', 'FROM_WORK'].includes(direction)) {
    res.status(400).json({ error: 'direction must be TO_WORK or FROM_WORK' });
    return;
  }
  if (to_user_id === fromUserId) {
    res.status(400).json({ error: 'Cannot express interest in yourself' });
    return;
  }

  // Verify target user exists
  const { rows: targetRows } = await pool.query(
    'SELECT id, display_name, email, notify_email FROM users WHERE id = $1',
    [to_user_id]
  );
  if (targetRows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const targetUser = targetRows[0];

  // Upsert interest (ignore duplicates)
  await pool.query(
    `INSERT INTO interests (id, from_user_id, to_user_id, direction)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (from_user_id, to_user_id, direction) DO NOTHING`,
    [uuidv4(), fromUserId, to_user_id, direction]
  );

  // Check for mutual interest
  const { rows: mutualRows } = await pool.query(
    `SELECT 1 FROM interests WHERE from_user_id = $1 AND to_user_id = $2 AND direction = $3`,
    [to_user_id, fromUserId, direction]
  );
  const isMutual = mutualRows.length > 0;

  // Send email notification if target has notify_email enabled
  if (targetUser.notify_email) {
    const { rows: fromRows } = await pool.query(
      'SELECT display_name FROM users WHERE id = $1',
      [fromUserId]
    );
    const fromName = fromRows[0]?.display_name || 'Someone';
    const appUrl = process.env.BASE_URL || 'http://localhost:3000';

    sendInterestEmail({
      toEmail: targetUser.email,
      toName: targetUser.display_name,
      fromName,
      direction,
      appUrl,
      isMutual,
    }).catch(err => console.error('Failed to send interest email:', err));
  }

  res.json({ ok: true, mutual: isMutual });
});

// Withdraw interest
router.delete('/', requireAuth, async (req: Request, res: Response) => {
  const fromUserId = req.user!.userId;
  const { to_user_id, direction } = req.body;

  if (!to_user_id || !direction) {
    res.status(400).json({ error: 'to_user_id and direction are required' });
    return;
  }

  await pool.query(
    `DELETE FROM interests WHERE from_user_id = $1 AND to_user_id = $2 AND direction = $3`,
    [fromUserId, to_user_id, direction]
  );

  res.json({ ok: true });
});

export default router;
