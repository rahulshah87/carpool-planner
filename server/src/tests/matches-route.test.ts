import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signToken } from '../auth';
import matchRoutes from '../routes/matches';

vi.mock('../db', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db';
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/matches', matchRoutes);

const validToken = signToken({ userId: 'user-1', email: 'u@test.com', displayName: 'User' });
const authCookie = `token=${validToken}`;

const fakeMatch = {
  id: 'match-1',
  user_a_id: 'user-1',
  user_b_id: 'user-2',
  direction: 'TO_WORK',
  detour_minutes: 5.2,
  time_overlap_minutes: 45,
  rank_score: -17.3,
  partner_name: 'Jane',
  partner_avatar: null,
  partner_neighborhood: 'Willy Street',
  partner_id: 'user-2',
  i_expressed_interest: false,
  they_expressed_interest: false,
};

describe('GET /api/matches', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(401);
  });

  it('returns empty array when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/matches').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns matches with sanitized partner_address (neighborhood only)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeMatch] });
    const res = await request(app).get('/api/matches').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].partner_address).toBe('Willy Street');
    expect(res.body[0].partner_neighborhood).toBeUndefined();
  });

  it('returns null partner_address when neighborhood is null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...fakeMatch, partner_neighborhood: null }] });
    const res = await request(app).get('/api/matches').set('Cookie', authCookie);
    expect(res.body[0].partner_address).toBeNull();
  });

  it('includes interest status fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...fakeMatch, i_expressed_interest: true, they_expressed_interest: true }] });
    const res = await request(app).get('/api/matches').set('Cookie', authCookie);
    expect(res.body[0].i_expressed_interest).toBe(true);
    expect(res.body[0].they_expressed_interest).toBe(true);
  });
});

describe('POST /api/matches/compute', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/matches/compute');
    expect(res.status).toBe(401);
  });

  it('returns 400 when user has no home address', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: null, home_lng: null }] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/home address/i);
  });

  it('returns 400 when user has no commute preferences', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] }) // user
      .mockResolvedValueOnce({ rows: [] }); // prefs
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/preferences/i);
  });

  it('returns computed count with no candidates', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [] })   // other users
      .mockResolvedValueOnce({ rows: [] });  // clear old matches
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(0);
    expect(res.body.matches).toEqual([]);
  });

  it('computes and inserts a match for a nearby compatible candidate', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })  // clear old matches
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }] })
      .mockResolvedValueOnce({ rows: [] });  // INSERT
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(1);
    expect(res.body.matches[0].direction).toBe('TO_WORK');
    expect(res.body.matches[0].partner_name).toBe('Jane');
  });

  it('skips candidate whose Haversine detour exceeds threshold', async () => {
    // user-2 at 43.3 is ~16 miles north; via-detour ≈ 59 min > 15 min default threshold
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.3, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })  // clear
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(0);
  });

  it('skips candidate with incompatible roles (both RIDER)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'RIDER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'RIDER' }] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(0);
  });

  it('skips when preference directions do not match', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ direction: 'FROM_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(0);
  });

  it('skips when schedules have no time overlap', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '06:00', latest_time: '07:00', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '08:00', latest_time: '09:00', days_of_week: [0, 1, 2], role: 'DRIVER' }] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(0);
  });

  it('uses Distance Matrix API when key is set', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn()
      // Call 1: currentUser → [user-2, WORK]  detour = 10 + 15 - 20 = 5 min
      .mockResolvedValueOnce({ json: async () => ({ status: 'OK', rows: [{ elements: [
        { status: 'OK', duration: { value: 600 } },
        { status: 'OK', duration: { value: 1200 } },
      ]}] }) })
      // Call 2: user-2 → WORK
      .mockResolvedValueOnce({ json: async () => ({ status: 'OK', rows: [{ elements: [
        { status: 'OK', duration: { value: 900 } },
      ]}] }) })
    );
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(1);
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });

  it('falls back to Haversine when Distance Matrix returns non-OK status', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: 'REQUEST_DENIED' }) })
      .mockResolvedValueOnce({ json: async () => ({ status: 'REQUEST_DENIED' }) })
    );
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(1);
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });

  it('falls back to Haversine on Distance Matrix network error', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', home_lat: 43.07, home_lng: -89.4 }] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'EITHER' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', home_lat: 43.08, home_lng: -89.4, display_name: 'Jane' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ direction: 'TO_WORK', earliest_time: '07:00', latest_time: '08:30', days_of_week: [0, 1, 2], role: 'DRIVER' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/matches/compute').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.computed).toBe(1);
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });
});
