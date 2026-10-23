import { expect, it, vi } from 'vitest';
import { eloDelta, RatingService } from './rating.service';
import { RoomsService } from './rooms.service';
it('rewards an upset more and preserves zero-sum rating', () => {
  expect(eloDelta(1000, 1000, 1)).toBe(16);
  expect(eloDelta(1000, 1000, 0.5)).toBe(0);
  expect(eloDelta(800, 1200, 1)).toBeGreaterThan(16);
  expect(eloDelta(1200, 800, 0)).toBe(-eloDelta(800, 1200, 1));
});
it('records a forfeit once with server-bound accounts, never before both players connect', async () => {
  const record = vi.fn(async () => {});
  const question = {
    title: {
      id: 'film',
      name: 'film',
      year: 2000,
      category: 'movies' as const,
    },
    frames: Array(5).fill('frame'),
    spotlight: [],
  };
  const rooms = new RoomsService(
    { deck: () => [question], has: () => true, search: () => [] },
    { record } as unknown as RatingService,
  );
  const [a, b] = rooms.createBattle('A', 'B', ['account-a', 'account-b']);
  rooms.connect(a.code, a.token, 'socket-a');
  rooms.tick();
  expect(record).not.toHaveBeenCalled();
  rooms.connect(b.code, b.token, 'socket-b');
  rooms.leave(a.code, a.token);
  await Promise.resolve();
  rooms.tick();
  expect(record).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      firstId: 'account-a',
      secondId: 'account-b',
      firstScore: 0,
      secondScore: 1,
    }),
  );
});
