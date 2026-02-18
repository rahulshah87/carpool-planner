import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signToken } from '../auth';
import preferencesRoutes from '../routes/preferences';

vi.mock('../db', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db';
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/preferences', preferencesRoutes);

const validToken = signToken({ userId: 'user-1', email: 'u@test.com', displayName: 'User' });
const authCookie = `token=${validToken}`;

const validPref = {
  direction: 'TO_WORK',
  earliest_time: '07:00',
  latest_time: '08:30',
  days_of_week: [0, 1, 2, 3, 4],
  role: 'EITHER',
};

const fakeRow = { id: 'pref-1', user_id: 'user-1', ...validPref };

describe('GET /api/preferences', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/preferences');
    expect(res.status).toBe(401);
  });

  it('returns preferences for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });
    const res = await request(app).get('/api/preferences').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].direction).toBe('TO_WORK');
  });

  it('returns empty array when no preferences', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/preferences').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PUT /api/preferences — validation', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/preferences').send(validPref);
    expect(res.status).toBe(401);
  });

  it('returns 400 when direction is missing', async () => {
    const { direction: _, ...rest } = validPref;
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing/i);
  });

  it('returns 400 for invalid direction', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({ ...validPref, direction: 'SIDEWAYS' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/direction/i);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({ ...validPref, role: 'PASSENGER' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  it('returns 400 when days_of_week is empty', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({ ...validPref, days_of_week: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/day/i);
  });

  it('returns 400 when days_of_week is not an array', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({ ...validPref, days_of_week: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid time format', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({ ...validPref, earliest_time: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/time format/i);
  });

  it('returns 400 when latest <= earliest', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({
      ...validPref,
      earliest_time: '08:30',
      latest_time: '07:00',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Latest departure/i);
  });

  it('returns 400 when latest equals earliest', async () => {
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send({
      ...validPref,
      earliest_time: '08:00',
      latest_time: '08:00',
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/preferences — upsert', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('inserts a new preference when none exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })           // existing check
      .mockResolvedValueOnce({ rows: [] })           // insert
      .mockResolvedValueOnce({ rows: [fakeRow] });   // fetch result
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send(validPref);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const insertCall = mockQuery.mock.calls[1][0] as string;
    expect(insertCall).toMatch(/INSERT/i);
  });

  it('updates an existing preference', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'pref-1' }] })   // existing check
      .mockResolvedValueOnce({ rows: [] })                    // update
      .mockResolvedValueOnce({ rows: [fakeRow] });            // fetch result
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send(validPref);
    expect(res.status).toBe(200);
    const updateCall = mockQuery.mock.calls[1][0] as string;
    expect(updateCall).toMatch(/UPDATE/i);
  });

  it('accepts FROM_WORK direction', async () => {
    const fromWorkPref = { ...validPref, direction: 'FROM_WORK', earliest_time: '17:00', latest_time: '18:30' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...fakeRow, direction: 'FROM_WORK' }] });
    const res = await request(app).put('/api/preferences').set('Cookie', authCookie).send(fromWorkPref);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/preferences/:direction', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/preferences/TO_WORK');
    expect(res.status).toBe(401);
  });

  it('deletes the preference and returns ok', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/preferences/TO_WORK').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const deleteCall = mockQuery.mock.calls[0][0] as string;
    expect(deleteCall).toMatch(/DELETE/i);
    expect(mockQuery.mock.calls[0][1]).toContain('TO_WORK');
  });
});
