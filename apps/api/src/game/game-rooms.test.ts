import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DemoCatalog, titles } from './catalog';
import { RoomsService } from '../rooms/rooms.service';
const catalog = new DemoCatalog();
beforeAll(() => catalog.onModuleInit());
afterEach(() => vi.useRealTimers());
function setup() {
  const rooms = new RoomsService(catalog);
  const a = rooms.create({ nickname: 'Аня', category: 'movies', mode: 'mix' }),
    b = rooms.join(a.code, 'Боря');
  rooms.connect(a.code, a.token, 'a');
  rooms.connect(b.code, b.token, 'b');
  rooms.ready(a.code, a.token, true);
  rooms.ready(b.code, b.token, true);
  return { rooms, a, b };
}
describe('game membership and demo catalogue', () => {
  it('uses the selected duration for the server deadline and hint stages', () => {
    vi.useFakeTimers();
    const rooms = new RoomsService(catalog);
    const a = rooms.create({
      nickname: 'Аня',
      category: 'movies',
      mode: 'frames',
      roundSeconds: 30,
    });
    const b = rooms.join(a.code, 'Боря');
    rooms.connect(a.code, a.token, 'a');
    rooms.connect(a.code, b.token, 'b');
    rooms.ready(a.code, a.token, true);
    rooms.ready(a.code, b.token, true);
    rooms.start(a.code, a.token);
    const game = rooms.snapshot(a.code).game!;
    expect(game.endsAt - game.startedAt).toBe(30000);
    vi.advanceTimersByTime(6000);
    rooms.tick();
    expect(rooms.snapshot(a.code).game!.stage).toBe(0);
    vi.advanceTimersByTime(24000);
    rooms.tick();
    expect(rooms.snapshot(a.code).game!.phase).toBe('reveal');
  });
  it('requires a host and connected ready players, locks mid-game joining', () => {
    const { rooms, a, b } = setup();
    expect(() => rooms.start(a.code, b.token)).toThrow();
    rooms.ready(a.code, b.token, false);
    expect(() => rooms.start(a.code, a.token)).toThrow();
    rooms.ready(a.code, b.token, true);
    rooms.start(a.code, a.token);
    expect(() => rooms.start(a.code, a.token)).toThrow();
    expect(() => rooms.join(a.code, 'Опоздал')).toThrow();
  });
  it('preserves personal cooldown on reconnect, and never leaks it to others', () => {
    const { rooms, a, b } = setup();
    rooms.start(a.code, a.token);
    const roundId = rooms.snapshot(a.code).game!.roundId;
    rooms.answer(a.code, a.token, {
      roundId,
      commandId: randomUUID(),
      titleId: 'demo-4',
    });
    rooms.disconnect(a.code, 'a');
    rooms.connect(a.code, a.token, 'a2');
    expect(rooms.personal(a.code, a.token)!.nextAllowedAt).toBeGreaterThan(
      Date.now(),
    );
    expect(rooms.personal(a.code, b.token)!.nextAllowedAt).toBe(0);
    expect(JSON.stringify(rooms.snapshot(a.code))).not.toContain(
      'nextAllowedAt',
    );
  });
  it('normalizes Russian spelling and searches decoys, without posters', () => {
    expect(catalog.search('animation', 'унесенные')).toMatchObject([
      { name: 'Унесённые призраками' },
    ]);
    expect(catalog.search('movies', 'НАЧ')).toMatchObject([{ name: 'Начало' }]);
    expect(catalog.search('series', 'Начало')).toEqual([]);
    expect(catalog.search('movies', '!!')).toEqual([]);
    expect(titles.length).toBe(36);
  });
  it('sends raster crops and supports all categories and modes', () => {
    for (const category of ['movies', 'series', 'animation'] as const) {
      const deck = catalog.deck(category);
      expect(deck).toHaveLength(3);
      for (const q of deck) {
        expect(q.frames).toHaveLength(5);
        expect(q.spotlight).toHaveLength(5);
        expect(q.spotlight[0]).toMatch(/^data:image\/png;base64,/);
        expect(q.spotlight[0]).not.toEqual(q.spotlight[4]);
      }
    }
  });
  it('finishes by server clock, resets readiness and supports a new match', () => {
    vi.useFakeTimers();
    const { rooms, a, b } = setup();
    rooms.start(a.code, a.token);
    const first = rooms.snapshot(a.code).game!.matchId;
    vi.advanceTimersByTime(153000);
    rooms.tick();
    expect(rooms.snapshot(a.code).game!.phase).toBe('finished');
    expect(() => rooms.start(a.code, a.token)).toThrow();
    rooms.ready(a.code, a.token, true);
    rooms.ready(a.code, b.token, true);
    rooms.start(a.code, a.token);
    expect(rooms.snapshot(a.code).game!.matchId).not.toBe(first);
    expect(
      rooms.snapshot(a.code).game!.standings.every((p) => p.score === 0),
    ).toBe(true);
  });
});
