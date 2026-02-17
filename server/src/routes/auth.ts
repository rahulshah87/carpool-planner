import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { signToken, requireAuth } from '../auth';

const router = Router();

function getBaseUrl(): string {
  return process.env.BASE_URL || 'http://localhost:3000';
}

function getOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${getBaseUrl()}/api/auth/google/callback`
  );
}

// Start Google OAuth flow
router.get('/google', (_req: Request, res: Response) => {
  const client = getOAuthClient();
  const authorizeUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'consent',
  });
  res.redirect(authorizeUrl);
});

// Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;

    const googleId = payload.sub;
    const email = payload.email!;
    const displayName = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture || null;

    // Upsert user
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE google_id = $1', [googleId]
    );

    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
      await pool.query(
        'UPDATE users SET email = $1, display_name = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4',
        [email, displayName, avatarUrl, userId]
      );
    } else {
      userId = uuidv4();
      await pool.query(
        'INSERT INTO users (id, google_id, email, display_name, avatar_url) VALUES ($1, $2, $3, $4, $5)',
        [userId, googleId, email, displayName, avatarUrl]
      );
    }

    // Issue JWT
    const token = signToken({ userId, email, displayName });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get current user
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user!.userId]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(rows[0]);
});

// Logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

export default router;
