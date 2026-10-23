import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DemoCatalog } from '../game/catalog';
import { RoomsService } from './rooms.service';
import { BattleService } from './battle.service';
const catalog = new DemoCatalog();
beforeAll(() => catalog.onModuleInit());
afterEach(() => vi.useRealTimers());
describe('solo and random duels', () => {
  it('keeps battle on the whole catalog and passes a party collection to the game', () => {
    const deck = vi.fn(() => catalog.deck('movies'));
    const rooms = new RoomsService({ deck, has: () => true, search: () => [] });
    const [a, b] = rooms.createBattle('A', 'B');
    rooms.connect(a.code, a.token, 'a');
    rooms.connect(b.code, b.token, 'b');
    expect(deck).toHaveBeenLastCalledWith('movies', 'frames', 'catalog', 'all');
    const solo = rooms.create({
      nickname: 'C',
      format: 'solo',
      category: 'movies',
      mode: 'frames',
      source: 'catalog',
      collection: 'nineties',
    });
    rooms.connect(solo.code, solo.token, 'c');
    expect(rooms.snapshot(solo.code).game?.phase).toBe('playing');
    expect(deck).toHaveBeenLastCalledWith(
      'movies',
      'frames',
      'catalog',
      'nineties',
    );
  });
  it('allows only the party host to change settings, clears readiness and locks during play', () => {
    const rooms = new RoomsService(catalog);
    const a = rooms.create({
      nickname: 'А',
      category: 'movies',
      mode: 'frames',
    });
    const b = rooms.join(a.code, 'Б');
    rooms.connect(a.code, a.token, 'a');
    rooms.connect(a.code, b.token, 'b');
    rooms.ready(a.code, a.token, true);
    rooms.ready(a.code, b.token, true);
    const input = {
      category: 'movies',
      mode: 'spotlight',
      roundSeconds: 60,
    } as const;
    expect(() => rooms.settings(a.code, b.token, input)).toThrow();
    rooms.settings(a.code, a.token, input);
    expect(rooms.snapshot(a.code)).toMatchObject({
      mode: 'spotlight',
      roundSeconds: 60,
    });
    expect(rooms.snapshot(a.code).players.every((p) => !p.ready)).toBe(true);
    rooms.ready(a.code, a.token, true);
    rooms.ready(a.code, b.token, true);
    rooms.start(a.code, a.token);
    expect(() => rooms.settings(a.code, a.token, input)).toThrow();
  });
  it('finishes a solo daily game one second after a correct answer instead of waiting for its deadline', () => {
    vi.useFakeTimers();
    const question = catalog.deck('movies')[0]!;
    const rooms = new RoomsService({
      deck: () => [question],
      has: () => true,
      search: () => [],
    });
    const session = rooms.createDaily(question, 'Игрок');
    rooms.connect(session.code, session.token, 'solo');
    const game = rooms.snapshot(session.code).game!;
    rooms.answer(session.code, session.token, {
      roundId: game.roundId,
      titleId: question.title.id,
      commandId: 'd2b21d89-b0d2-410b-a129-f10eb5c27779',
    });
    expect(rooms.snapshot(session.code).game!.phase).toBe('reveal');
    vi.advanceTimersByTime(1000);
    rooms.tick();
    expect(rooms.snapshot(session.code).game!.phase).toBe('finished');
  });
  it('allows one connected solo player but never a second member', () => {
    const rooms = new RoomsService(catalog);
    const a = rooms.create({
      nickname: 'Аня',
      format: 'solo',
      category: 'movies',
      mode: 'spotlight',
    });
    expect(() => rooms.start(a.code, a.token)).toThrow();
    rooms.connect(a.code, a.token, 'a');
    expect(rooms.snapshot(a.code).game?.phase).toBe('playing');
    expect(rooms.snapshot(a.code).capacity).toBe(1);
    expect(() => rooms.join(a.code, 'Друг')).toThrow();
  });
  it('does not match an account with itself, starts once both connect and rejects outsiders', () => {
    const rooms = new RoomsService(catalog),
      queue = new BattleService(rooms);
    const a = { id: 'a', nickname: 'Игрок' },
      b = { id: 'b', nickname: 'Игрок' };
    expect(queue.join(a).status).toBe('waiting');
    expect(queue.join(a).status).toBe('waiting');
    expect(queue.join(b).status).toBe('matched');
    const one = queue.status(a.id),
      two = queue.status(b.id);
    if (!('session' in one) || !('session' in two))
      throw new Error('Not matched');
    expect(one.session.code).toBe(two.session.code);
    expect(one.session.token).not.toBe(two.session.token);
    rooms.connect(one.session.code, one.session.token, 'a');
    expect(rooms.snapshot(one.session.code).game).toBeUndefined();
    expect(() => rooms.start(one.session.code, one.session.token)).toThrow();
    expect(() => rooms.join(one.session.code, 'Посторонний')).toThrow();
    rooms.connect(two.session.code, two.session.token, 'b');
    const game = rooms.snapshot(one.session.code).game!;
    expect(game.phase).toBe('playing');
    rooms.disconnect(one.session.code, 'a');
    rooms.connect(one.session.code, one.session.token, 'a2');
    expect(rooms.snapshot(one.session.code).game!.matchId).toBe(game.matchId);
    expect(() => queue.cancel(a.id)).toThrow();
  });
  it('expires abandoned searches and unjoined matches', () => {
    vi.useFakeTimers();
    const rooms = new RoomsService(catalog),
      queue = new BattleService(rooms);
    queue.join({ id: 'a', nickname: 'Аня' });
    vi.advanceTimersByTime(30001);
    expect(queue.join({ id: 'b', nickname: 'Боря' }).status).toBe('waiting');
    queue.cancel('b');
    expect(queue.status('b').status).toBe('idle');
    queue.join({ id: 'a', nickname: 'Аня' });
    queue.join({ id: 'b', nickname: 'Боря' });
    vi.advanceTimersByTime(60001);
    expect(queue.status('a').status).toBe('idle');
    expect(queue.status('b').status).toBe('idle');
  });
});
