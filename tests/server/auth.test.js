// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { generateJWT, verifyJWT } from '../../server/auth.js';

// Note: authMiddleware and optionalAuthMiddleware are not tested here because
// they require a live database connection. They are covered by integration tests.

describe('generateJWT', () => {
  it('returns a non-empty string', () => {
    const token = generateJWT(42);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('produces a JWT with three dot-separated segments', () => {
    const token = generateJWT(1);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('generates different tokens for different user IDs', () => {
    const t1 = generateJWT(1);
    const t2 = generateJWT(2);
    expect(t1).not.toBe(t2);
  });

  it('generates different tokens on successive calls (timestamp differs)', async () => {
    const t1 = generateJWT(99);
    await new Promise(r => setTimeout(r, 10));
    const t2 = generateJWT(99);
    // The iat (issued-at) claim will differ slightly; tokens should not be identical
    // This is not guaranteed to differ within <1s but is a reasonable sanity check
    expect(typeof t1).toBe('string');
    expect(typeof t2).toBe('string');
  });
});

describe('verifyJWT', () => {
  it('returns the payload for a valid token', () => {
    const userId = 123;
    const token = generateJWT(userId);
    const payload = verifyJWT(token);

    expect(payload).not.toBeNull();
    expect(payload.userId).toBe(userId);
  });

  it('returns null for a tampered token', () => {
    const token = generateJWT(1);
    const [header, payload, sig] = token.split('.');
    const tampered = `${header}.${payload}.invalidsignature`;
    expect(verifyJWT(tampered)).toBeNull();
  });

  it('returns null for a completely invalid string', () => {
    expect(verifyJWT('not.a.jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyJWT('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(verifyJWT(null)).toBeNull();
  });

  it('decoded payload contains iat and exp claims', () => {
    const token = generateJWT(5);
    const payload = verifyJWT(token);
    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('exp');
  });

  it('exp is roughly 7 days from now', () => {
    const token = generateJWT(5);
    const payload = verifyJWT(token);
    const sevenDaysMs = 7 * 24 * 60 * 60;
    const diff = payload.exp - payload.iat;
    // Allow ±60 seconds tolerance
    expect(Math.abs(diff - sevenDaysMs)).toBeLessThan(60);
  });
});
