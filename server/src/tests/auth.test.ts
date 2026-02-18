import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signToken, verifyToken, requireAuth } from '../auth';
import type { Request, Response, NextFunction } from 'express';

const TEST_PAYLOAD = { userId: 'user-1', email: 'test@example.com', displayName: 'Test User' };

describe('signToken / verifyToken', () => {
  it('round-trips a payload', () => {
    const token = signToken(TEST_PAYLOAD);
    const result = verifyToken(token);
    expect(result.userId).toBe(TEST_PAYLOAD.userId);
    expect(result.email).toBe(TEST_PAYLOAD.email);
    expect(result.displayName).toBe(TEST_PAYLOAD.displayName);
  });

  it('throws on a tampered token', () => {
    const token = signToken(TEST_PAYLOAD);
    expect(() => verifyToken(token + 'x')).toThrow();
  });

  it('throws on a garbage string', () => {
    expect(() => verifyToken('not-a-jwt')).toThrow();
  });
});

describe('requireAuth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { cookies: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('calls next() with valid token cookie', () => {
    req.cookies = { token: signToken(TEST_PAYLOAD) };
    requireAuth(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as Request).user?.userId).toBe(TEST_PAYLOAD.userId);
  });

  it('returns 401 when no token cookie', () => {
    req.cookies = {};
    requireAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token', () => {
    req.cookies = { token: 'bad-token' };
    requireAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
