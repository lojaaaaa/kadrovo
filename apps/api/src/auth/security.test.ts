import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import {
  cookie,
  hashPassword,
  RateLimit,
  sameOrigin,
  verifyPassword,
} from './security';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('account security', () => {
  it('salts password hashes and rejects a different password', async () => {
    const a = await hashPassword('correct long password'),
      b = await hashPassword('correct long password');
    expect(a).not.toEqual(b);
    expect(a).not.toContain('correct');
    expect(await verifyPassword('correct long password', a)).toBe(true);
    expect(await verifyPassword('wrong password', a)).toBe(false);
    expect(await verifyPassword('anything', 'malformed')).toBe(false);
  });
  it('requires the configured origin for cookie-authenticated mutations', () => {
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    expect(() =>
      sameOrigin({
        headers: { origin: 'https://attacker.example' },
      } as Request),
    ).toThrow();
    expect(() => sameOrigin({ headers: {} } as Request)).toThrow();
    expect(() =>
      sameOrigin({ headers: { origin: 'http://localhost:3000' } } as Request),
    ).not.toThrow();
    expect(
      cookie(
        { headers: { cookie: 'other=1; filmless_session=abc' } } as Request,
        'filmless_session',
      ),
    ).toBe('abc');
  });
  it('limits attempts and expires the window', () => {
    vi.useFakeTimers();
    const limit = new RateLimit();
    limit.take('one', 1, 1000);
    expect(() => limit.take('one', 1, 1000)).toThrow();
    expect(() => limit.take('two', 1, 1000)).not.toThrow();
    vi.advanceTimersByTime(1001);
    expect(() => limit.take('one', 1, 1000)).not.toThrow();
  });
});
