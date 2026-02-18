import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('PUT /api/profile', () => {
  beforeEach(() => { mockQuery.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns 401 without token', async () => {
    const res = await request(app).put('/api/profile');
    expect(res.status).toBe(401);
  });

  it('saves address with provided lat/lng (skips geocoding)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', authCookie)
      .send({ home_address: '123 Main St', home_lat: 43.07, home_lng: -89.4 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });

  it('geocodes address when no lat/lng provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      json: async () => ({
        results: [{
          geometry: { location: { lat: 43.07, lng: -89.4 } },
          address_components: [{ types: ['neighborhood'], long_name: 'Willy Street' }],
        }],
      }),
    }));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...fakeUser, home_lat: 43.07, home_lng: -89.4, home_neighborhood: 'Willy Street' }] });
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', authCookie)
      .send({ home_address: '123 Main St' });
    expect(res.status).toBe(200);
    expect(res.body.home_neighborhood).toBe('Willy Street');
  });

  it('uses sublocality fallback when no neighborhood component', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      json: async () => ({
        results: [{
          geometry: { location: { lat: 43.07, lng: -89.4 } },
          address_components: [{ types: ['sublocality_level_1'], long_name: 'Downtown' }],
        }],
      }),
    }));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', authCookie)
      .send({ home_address: '123 Main St' });
    expect(res.status).toBe(200);
  });

  it('handles geocoding fetch error gracefully (still saves)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', authCookie)
      .send({ home_address: '123 Main St' });
    expect(res.status).toBe(200);
  });

  it('handles empty geocoding results (saves without coords)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      json: async () => ({ results: [] }),
    }));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', authCookie)
      .send({ home_address: '123 Main St' });
    expect(res.status).toBe(200);
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

  it('updates notify_email to true', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch('/api/profile/notifications').set('Cookie', authCookie).send({ notify_email: true });
    expect(res.status).toBe(200);
    expect(res.body.notify_email).toBe(true);
  });

  it('returns 400 for non-boolean', async () => {
    const res = await request(app).patch('/api/profile/notifications').set('Cookie', authCookie).send({ notify_email: 'yes' });
    expect(res.status).toBe(400);
  });
});
