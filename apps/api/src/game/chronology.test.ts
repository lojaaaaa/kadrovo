import { afterEach, expect, it, vi } from 'vitest';
import { ChronologyGame } from './chronology';
import type { TitleOption } from '@filmless/contracts';
const titles: TitleOption[] = Array.from({ length: 30 }, (_, i) => ({
  id: String(i),
  name: 'Фильм ' + i,
  year: 1990 + i,
  posterUrl: '/api/content/image/' + i,
  category: 'movies',
}));
afterEach(() => vi.useRealTimers());
it('hides the unknown year until a single server-checked answer, and rejects a second attempt', () => {
  const game = new ChronologyGame(),
    s = game.start('a', titles);
  expect(s.challenger.year).toBeUndefined();
  expect(s.result).toBeUndefined();
  const byName = new Map(titles.map((t) => [t.name, t.year!]));
  const choice =
    byName.get(s.challenger.name)! < s.anchor.year! ? 'earlier' : 'later';
  const result = game.answer(s.sessionId, 'a', s.pairId, 'cmd', choice);
  expect(result.score).toBe(1);
  expect(result.challenger.year).toBeDefined();
  expect(game.answer(s.sessionId, 'a', s.pairId, 'cmd', choice)).toEqual(
    result,
  );
  expect(() => game.answer(s.sessionId, 'a', s.pairId, 'new', 'later')).toThrow(
    'уже принят',
  );
  expect(() => game.snapshot(s.sessionId, 'b')).toThrow('недоступна');
  const next = game.next(s.sessionId, 'a', s.pairId);
  expect(next.round).toBe(2);
  expect(next.challenger.year).toBeUndefined();
  expect(game.next(s.sessionId, 'a', s.pairId)).toEqual(next);
  expect(() => game.answer(s.sessionId, 'a', s.pairId, 'old', choice)).toThrow(
    'завершена',
  );
});
it('offers ten unambiguous pairs without film repeats, and has a stable finish', () => {
  const game = new ChronologyGame();
  let s = game.start('a', [...titles, ...titles]);
  const seen = new Set([s.anchor.name]);
  for (let i = 0; i < 10; i++) {
    expect(seen.has(s.challenger.name)).toBe(false);
    seen.add(s.challenger.name);
    const challenger = titles.find((t) => t.name === s.challenger.name)!;
    expect(challenger.year).not.toBe(s.anchor.year);
    s = game.answer(
      s.sessionId,
      'a',
      s.pairId,
      String(i),
      challenger.year! < s.anchor.year! ? 'earlier' : 'later',
    );
    if (i < 9) s = game.next(s.sessionId, 'a', s.pairId);
  }
  expect(s.phase).toBe('finished');
  expect(s.score).toBe(10);
  expect(s.total).toBe(10);
  expect(game.next(s.sessionId, 'a', s.pairId)).toEqual(s);
});
it('cannot skip unanswered pairs, expires idle sessions and excludes equal years', () => {
  const game = new ChronologyGame();
  const s = game.start('a', titles);
  expect(() => game.next(s.sessionId, 'a', s.pairId)).toThrow('Сначала');
  expect(() =>
    game.start(
      'b',
      titles.map((t) => ({ ...t, year: 2000 })),
    ),
  ).toThrow('недостаточно');
  vi.useFakeTimers();
  vi.advanceTimersByTime(31 * 60000);
  expect(() => game.snapshot(s.sessionId, 'a')).toThrow('недоступна');
});

it('reuses a start command only for its owner', () => {
  const game = new ChronologyGame();
  const started = game.start('guest:a', titles, 'start-1');
  expect(game.started('guest:a', 'start-1')).toEqual(started);
  expect(game.started('guest:b', 'start-1')).toBeUndefined();
  expect(game.started('guest:a', 'different')).toBeUndefined();
});
