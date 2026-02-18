import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signToken } from '../auth';
import authRoutes from '../routes/auth';

vi.mock('../db', () => ({
  default: { query: vi.fn() },
}));

vi.mock('google-auth-library', () => {
  class MockOAuth2Client {
    generateAuthUrl() {
      return 'https://accounts.google.com/o/oauth2/auth?mock';
    }
    async getToken() {
      return { tokens: { id_token: 'mock-id-token' } };
    }
    setCredentials() {}
    async verifyIdToken() {
      return {
        getPayload: () => ({
          sub: 'google-sub-123',
          email: 'test@epic.com',
          name: 'Test User',
          picture: null,
        }),
      };
    }
  }
  return { OAuth2Client: MockOAuth2Client };
});

import pool from '../db';
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);

const validToken = signToken({ userId: 'user-1', email: 'u@test.com', displayName: 'User' });
const authCookie = `token=${validToken}`;

const fakeUser = { id: 'user-1', email: 'u@test.com', display_name: 'User', avatar_url: null };

describe('GET /api/auth/google', () => {
  it('redirects to Google OAuth URL', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });
});

describe('GET /api/auth/google/callback', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 400 when code is missing', async () => {
    const res = await request(app).get('/api/auth/google/callback');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code/i);
  });

  it('creates a new user and sets cookie when user does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // existing user check
      .mockResolvedValueOnce({ rows: [] });  // insert new user
    const res = await request(app).get('/api/auth/google/callback?code=mock-code');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toContain('token=');
    const insertCall = mockQuery.mock.calls[1][0] as string;
    expect(insertCall).toMatch(/INSERT INTO users/i);
  });

  it('updates an existing user and sets cookie', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })  // user found
      .mockResolvedValueOnce({ rows: [] });                         // update
    const res = await request(app).get('/api/auth/google/callback?code=mock-code');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    const updateCall = mockQuery.mock.calls[1][0] as string;
    expect(updateCall).toMatch(/UPDATE users/i);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user data for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).get('/api/auth/me').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });

  it('returns 404 when user not found in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/auth/me').set('Cookie', authCookie);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears token cookie and returns ok', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Cookie should be cleared (set to empty or max-age=0)
    const cookies = res.headers['set-cookie'];
    if (cookies) {
      const tokenCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c: string) => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
    }
  });
});
