import { expect, it } from 'vitest';
import { dailyCountdown } from './daily-clock';
it('counts down with server time even when the device is several days ahead', () => {
  const server = 1000,
    device = 999999999;
  expect(
    dailyCountdown(server + 3600000, server, device, device + 60000),
  ).toEqual({ expired: false, text: '0 ч 59 мин' });
  expect(
    dailyCountdown(server + 3600000, server, device, device + 3600001),
  ).toEqual({ expired: true, text: '0 ч 00 мин' });
});
