import { beforeAll, afterEach, it, expect, vi } from 'vitest';
import { DemoCatalog } from '../game/catalog';
import { RoomsService } from './rooms.service';
const catalog = new DemoCatalog();
beforeAll(() => catalog.onModuleInit());
afterEach(() => vi.useRealTimers());
it('requires mutual rematch consent and deals a new match only once', () => {
  const rooms = new RoomsService(catalog);
  const a = rooms.create({ nickname: 'А', category: 'movies', mode: 'frames' }),
    b = rooms.join(a.code, 'Б');
  rooms.connect(a.code, a.token, 'a');
  rooms.connect(b.code, b.token, 'b');
  rooms.start(a.code, a.token, true);
  vi.useFakeTimers();
  vi.advanceTimersByTime(200000);
  rooms.tick();
  const previous = rooms.snapshot(a.code).game!;
  expect(previous.phase).toBe('finished');
  rooms.rematch(a.code, a.token);
  expect(rooms.snapshot(a.code).game?.matchId).toBe(previous.matchId);
  rooms.rematch(a.code, a.token);
  expect(rooms.snapshot(a.code).rematchVotes).toHaveLength(1);
  rooms.rematch(a.code, b.token);
  expect(rooms.snapshot(a.code).game?.matchId).not.toBe(previous.matchId);
  expect(rooms.snapshot(a.code).game?.phase).toBe('playing');
  expect(() => rooms.rematch(a.code, a.token)).toThrow();
});
it('allows every lobby member to choose tastes but locks votes during the game', () => {
  const rooms = new RoomsService(catalog);
  const a = rooms.create({ nickname: 'А', category: 'movies', mode: 'frames' }),
    b = rooms.join(a.code, 'Б');
  rooms.connect(a.code, a.token, 'a');
  rooms.connect(b.code, b.token, 'b');
  rooms.tastes(a.code, b.token, ['nineties']);
  expect(rooms.snapshot(a.code).tasteVotes?.[b.playerId]).toEqual(['nineties']);
  rooms.start(a.code, a.token, true);
  expect(() => rooms.tastes(a.code, b.token, ['recent'])).toThrow();
});
it('only the captain can answer a cooperative room and the wrong-answer penalty is shared once', () => {
  const question = catalog.deck('movies')[0]!;
  const fixed = {
    deck: () => [question],
    options: () => catalog.options('movies'),
    has: () => true,
    search: () => [],
  };
  const rooms = new RoomsService(fixed);
  const a = rooms.create({
      nickname: 'А',
      category: 'movies',
      mode: 'frames',
      sharedAnswer: true,
      answerMode: 'choices',
    }),
    b = rooms.join(a.code, 'Б');
  rooms.connect(a.code, a.token, 'a');
  rooms.connect(b.code, b.token, 'b');
  rooms.start(a.code, a.token, true);
  const g = rooms.snapshot(a.code, a.token).game!;
  const titleId = g.choices!.find((t) => t.id !== question.title.id)!.id;
  const command = {
    roundId: g.roundId,
    commandId: crypto.randomUUID(),
    titleId,
  };
  expect(() => rooms.answer(a.code, b.token, command)).toThrow('ведущий');
  rooms.answer(a.code, a.token, command);
  expect(rooms.snapshot(a.code).game?.standings.map((p) => p.score)).toEqual([
    -4, -4,
  ]);
  rooms.answer(a.code, a.token, command);
  expect(rooms.snapshot(a.code).game?.standings.map((p) => p.score)).toEqual([
    -4, -4,
  ]);
});
