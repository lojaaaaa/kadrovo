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
  const game = rooms.snapshot(a.code).game!;
  rooms.answer(a.code, b.token, {
    roundId: game.roundId,
    commandId: crypto.randomUUID(),
    titleId: 'film',
  });
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

function duel() {
  const record = vi.fn(async () => {});
  const question = {
    title: {
      id: 'film',
      name: 'Фильм',
      year: 2000,
      category: 'movies' as const,
    },
    frames: Array(5).fill('frame'),
    spotlight: [],
  };
  const rooms = new RoomsService(
    {
      deck: () => [
        question,
        { ...question, title: { ...question.title, id: 'film-2' } },
      ],
      has: () => true,
      search: () => [],
    },
    { record } as unknown as RatingService,
  );
  const [a, b] = rooms.createBattle('A', 'B', ['account-a', 'account-b']);
  rooms.connect(a.code, a.token, 'a');
  rooms.connect(b.code, b.token, 'b');
  return { rooms, a, b, record };
}
it('aborts a zero-score first-round departure without a rating result', () => {
  const { rooms, a, b, record } = duel();
  rooms.leave(a.code, a.token);
  rooms.tick();
  expect(rooms.snapshot(b.code).game).toMatchObject({
    phase: 'finished',
    termination: { reason: 'aborted', playerId: a.playerId },
  });
  expect(record).not.toHaveBeenCalled();
});
it('counts a departure in later rounds as a loss even at zero score', () => {
  vi.useFakeTimers();
  try {
    const { rooms, a, b, record } = duel();
    const game = rooms.snapshot(a.code).game!;
    rooms.skip(a.code, a.token, game.roundId);
    rooms.skip(b.code, b.token, game.roundId);
    vi.advanceTimersByTime(3100);
    rooms.tick();
    expect(rooms.snapshot(a.code).game?.roundNumber).toBe(2);
    rooms.leave(a.code, a.token);
    expect(rooms.snapshot(b.code).game?.termination).toEqual({
      reason: 'forfeit',
      playerId: a.playerId,
      winnerId: b.playerId,
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ firstScore: 0, secondScore: 1 }),
    );
  } finally {
    vi.useRealTimers();
  }
});
it('allows reconnection during grace and aborts only after the next full disconnect expires', () => {
  vi.useFakeTimers();
  try {
    const { rooms, a, b, record } = duel();
    rooms.disconnect(a.code, 'a');
    vi.advanceTimersByTime(14000);
    rooms.tick();
    expect(rooms.snapshot(b.code).game?.phase).toBe('playing');
    rooms.connect(a.code, a.token, 'reconnected');
    vi.advanceTimersByTime(2000);
    rooms.tick();
    expect(rooms.snapshot(b.code).game?.termination).toBeUndefined();
    rooms.disconnect(a.code, 'reconnected');
    vi.advanceTimersByTime(15001);
    rooms.tick();
    expect(rooms.snapshot(b.code).game?.termination?.reason).toBe('aborted');
    expect(record).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it('waits for all tabs to disconnect and records one forfeit after grace', () => {
  vi.useFakeTimers();
  try {
    const { rooms, a, b, record } = duel();
    rooms.connect(a.code, a.token, 'second-tab');
    const game = rooms.snapshot(a.code).game!;
    rooms.answer(a.code, b.token, {
      roundId: game.roundId,
      commandId: crypto.randomUUID(),
      titleId: 'film',
    });
    rooms.disconnect(a.code, 'a');
    vi.advanceTimersByTime(16000);
    rooms.tick();
    expect(rooms.snapshot(b.code).game?.termination).toBeUndefined();
    rooms.disconnect(a.code, 'second-tab');
    vi.advanceTimersByTime(15001);
    rooms.tick();
    rooms.tick();
    expect(rooms.snapshot(b.code).game?.termination?.reason).toBe('forfeit');
    expect(record).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
