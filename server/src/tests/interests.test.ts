import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signToken } from '../auth';
import interestRoutes from '../routes/interests';

// Mock DB pool
vi.mock('../db', () => ({
  default: { query: vi.fn() },
}));

// Mock email so no real sends happen
vi.mock('../email', () => ({
  sendInterestEmail: vi.fn().mockResolvedValue(undefined),
}));

import pool from '../db';
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/interests', interestRoutes);

const validToken = signToken({ userId: 'user-a', email: 'a@test.com', displayName: 'User A' });
const authCookie = `token=${validToken}`;

describe('POST /api/interests', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/interests').send({ to_user_id: 'user-b', direction: 'TO_WORK' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-b' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid direction', async () => {
    const res = await request(app).post('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-b', direction: 'BAD' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when expressing interest in yourself', async () => {
    const res = await request(app).post('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-a', direction: 'TO_WORK' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when target user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-b', direction: 'TO_WORK' });
    expect(res.status).toBe(404);
  });

  it('records interest and returns ok', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-b', display_name: 'B', email: 'b@t.com', notify_email: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-b', direction: 'TO_WORK' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mutual).toBe(false);
  });

  it('detects mutual interest', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-b', display_name: 'B', email: 'b@t.com', notify_email: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    const res = await request(app).post('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-b', direction: 'TO_WORK' });
    expect(res.body.mutual).toBe(true);
  });
});

describe('DELETE /api/interests', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without a token', async () => {
    const res = await request(app).delete('/api/interests').send({ to_user_id: 'user-b', direction: 'TO_WORK' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).delete('/api/interests').set('Cookie', authCookie).send({});
    expect(res.status).toBe(400);
  });

  it('deletes interest and returns ok', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/interests').set('Cookie', authCookie).send({ to_user_id: 'user-b', direction: 'TO_WORK' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
