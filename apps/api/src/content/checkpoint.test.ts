import { expect, it } from 'vitest';
import {
  checkpointReady,
  credentialFingerprint,
  markBlocked,
  type SyncCheckpoint,
} from './checkpoint';
it('stops quota retries, resumes after cooldown, and preserves cursors', () => {
  const state: SyncCheckpoint = {
    lastAttempt: 0,
    index: 1,
    cursors: { movies: 'v2:2:3' },
  };
  const fingerprint = credentialFingerprint('provider', 'secret');
  expect(fingerprint).not.toContain('secret');
  expect(
    markBlocked(state, fingerprint, new Error('Provider: HTTP 402.'), 100),
  ).toBe(true);
  expect(checkpointReady(state, fingerprint, 200)).toBe(false);
  expect(checkpointReady(state, fingerprint, 100 + 24 * 60 * 60 * 1000)).toBe(
    true,
  );
  expect(state.cursors.movies).toBe('v2:2:3');
  expect(state.lastAttempt).toBe(0);
});
it('allows a changed key immediately but does not block on transient network failure', () => {
  const state: SyncCheckpoint = { lastAttempt: 100, index: 0, cursors: {} };
  expect(markBlocked(state, 'old', new TypeError('fetch failed'), 100)).toBe(
    false,
  );
  markBlocked(state, 'old', new Error('HTTP 403'), 100);
  expect(checkpointReady(state, 'new', 101)).toBe(true);
  expect(state.blocked).toBeUndefined();
});
