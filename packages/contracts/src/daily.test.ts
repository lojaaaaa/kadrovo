import { expect, it } from 'vitest';
import { dailyWindow, isArchiveDay } from './daily';
it('changes challenges exactly at Moscow midnight, including year rollover', () => {
  const before = Date.parse('2026-12-31T20:59:59.999Z');
  expect(dailyWindow(before)).toEqual({
    day: '2026-12-31',
    nextAt: before + 1,
    serverTime: before,
  });
  expect(dailyWindow(before + 1).day).toBe('2027-01-01');
  expect(dailyWindow(before + 1).nextAt).toBe(before + 1 + 86400000);
});
it('never opens today or future answers through archive training', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  expect(isArchiveDay('2026-10-23', now)).toBe(true);
  for (const day of [
    '2026-10-24',
    '2026-10-25',
    '2026-02-30',
    '2026-13-01',
    'garbage',
  ])
    expect(isArchiveDay(day, now)).toBe(false);
});
