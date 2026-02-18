import { describe, it, expect } from 'vitest';
import { haversine, timeToMinutes, computeOverlap, rolesCompatible } from '../routes/matches';

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(43.0, -89.4, 43.0, -89.4)).toBe(0);
  });

  it('computes reasonable distance between Madison and Milwaukee (~77 miles)', () => {
    const dist = haversine(43.0731, -89.4012, 43.0389, -87.9065);
    expect(dist).toBeGreaterThan(70);
    expect(dist).toBeLessThan(85);
  });

  it('is symmetric', () => {
    const a = haversine(43.0, -89.4, 43.1, -89.5);
    const b = haversine(43.1, -89.5, 43.0, -89.4);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('timeToMinutes', () => {
  it('converts "07:00" to 420', () => {
    expect(timeToMinutes('07:00')).toBe(420);
  });

  it('converts "17:30" to 1050', () => {
    expect(timeToMinutes('17:30')).toBe(1050);
  });

  it('converts "00:00" to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });
});

describe('computeOverlap', () => {
  it('returns zero overlap when no common days', () => {
    const result = computeOverlap('07:00', '08:00', [0, 1], '07:00', '08:00', [2, 3]);
    expect(result.overlapMinutes).toBe(0);
    expect(result.commonDays).toEqual([]);
  });

  it('returns zero overlap when time windows do not overlap', () => {
    const result = computeOverlap('07:00', '08:00', [0], '08:30', '09:30', [0]);
    expect(result.overlapMinutes).toBe(0);
  });

  it('computes partial time window overlap', () => {
    const result = computeOverlap('07:00', '08:30', [0, 1, 2], '08:00', '09:00', [1, 2, 3]);
    expect(result.overlapMinutes).toBe(30);
    expect(result.commonDays).toEqual([1, 2]);
  });

  it('computes full overlap when one window contains the other', () => {
    const result = computeOverlap('07:00', '09:00', [0], '07:30', '08:30', [0]);
    expect(result.overlapMinutes).toBe(60);
  });

  it('computes exact overlap at window boundaries', () => {
    const result = computeOverlap('07:00', '08:00', [0], '08:00', '09:00', [0]);
    expect(result.overlapMinutes).toBe(0);
  });
});

describe('rolesCompatible', () => {
  it('returns false when both are RIDER', () => {
    expect(rolesCompatible('RIDER', 'RIDER')).toBe(false);
  });

  it('returns true when one is DRIVER', () => {
    expect(rolesCompatible('DRIVER', 'RIDER')).toBe(true);
    expect(rolesCompatible('RIDER', 'DRIVER')).toBe(true);
  });

  it('returns true when both are DRIVER', () => {
    expect(rolesCompatible('DRIVER', 'DRIVER')).toBe(true);
  });

  it('returns true when either is EITHER', () => {
    expect(rolesCompatible('EITHER', 'RIDER')).toBe(true);
    expect(rolesCompatible('RIDER', 'EITHER')).toBe(true);
    expect(rolesCompatible('EITHER', 'EITHER')).toBe(true);
  });
});
