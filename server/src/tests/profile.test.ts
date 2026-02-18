import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signToken } from '../auth';
import profileRoutes from '../routes/profile';

vi.mock('../db', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db';
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/profile', profileRoutes);

const validToken = signToken({ userId: 'user-1', email: 'u@test.com', displayName: 'User' });
const authCookie = `token=${validToken}`;

const fakeUser = {
  id: 'user-1',
  email: 'u@test.com',
  display_name: 'User',
  home_address: null,
  home_lat: null,
  home_lng: null,
  home_neighborhood: null,
  notify_email: true,
};

describe('GET /api/profile', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  it('returns user data', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).get('/api/profile').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
    expect(res.body.notify_email).toBe(true);
  });

  it('returns 404 when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/profile').set('Cookie', authCookie);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/profile/notifications', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('updates notify_email to false', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch('/api/profile/notifications').set('Cookie', authCookie).send({ notify_email: false });
    expect(res.status).toBe(200);
    expect(res.body.notify_email).toBe(false);
  });

  it('returns 400 for non-boolean', async () => {
    const res = await request(app).patch('/api/profile/notifications').set('Cookie', authCookie).send({ notify_email: 'yes' });
    expect(res.status).toBe(400);
  });
});
