import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvalWhere, localContentPreview } from './approval';
afterEach(() => vi.unstubAllEnvs());
describe('local content preview', () => {
  it('requires explicit opt-in and a loopback web origin', () => {
    vi.stubEnv('LOCAL_CONTENT_PREVIEW', 'false');
    expect(localContentPreview()).toBe(false);
    vi.stubEnv('LOCAL_CONTENT_PREVIEW', 'true');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    expect(localContentPreview()).toBe(true);
    expect(approvalWhere()).toEqual({
      editorialStatus: { in: ['approved', 'automated'] },
      rightsStatus: { in: ['unreviewed', 'approved'] },
    });
    for (const origin of [
      'https://filmless.example',
      'http://localhost.evil.example',
      'invalid',
    ]) {
      vi.stubEnv('WEB_ORIGIN', origin);
      expect(localContentPreview()).toBe(false);
      expect(approvalWhere()).toEqual({
        editorialStatus: { in: ['approved', 'automated'] },
        rightsStatus: 'approved',
        permissionReference: { not: null },
      });
    }
  });
});

it('allows explicit hosted provider preview without approving rejected assets', () => {
  vi.stubEnv('PROVIDER_CONTENT_PREVIEW', 'true');
  vi.stubEnv('WEB_ORIGIN', 'https://example.com');
  expect(localContentPreview()).toBe(true);
  expect(approvalWhere().rightsStatus).toEqual({
    in: ['unreviewed', 'approved'],
  });
});
