import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Match } from './match';
import type { Question } from './catalog';
const deck: Question[] = Array.from({ length: 3 }, (_, i) => ({
  title: {
    id: `title-${i}`,
    name: `Секрет ${i}`,
    year: 2000 + i,
    category: 'movies',
  },
  frames: Array.from({ length: 5 }, (_, j) => `frame-${i}-${j}`),
  spotlight: Array.from({ length: 5 }, (_, j) => `crop-${i}-${j}`),
}));
const players = [
  { id: 'a', nickname: 'Аня' },
  { id: 'b', nickname: 'Боря' },
];
const command = (m: Match, titleId = 'title-0', commandId = randomUUID()) => ({
  roundId: m.snapshot(1000).roundId,
  titleId,
  commandId,
});
describe('authoritative match', () => {
  it('ends only the skipping player attempt, preserves it on reconnect and reveals when everyone finishes', () => {
    const m = new Match(deck, 'frames', players, 1000);
    const id = m.snapshot(1000).roundId;
    m.skip('a', id, 2000);
    m.skip('a', id, 2100);
    expect(m.snapshot(2100, 'a')).toMatchObject({
      phase: 'playing',
      personalSkipped: true,
      personalExpired: true,
      endsAt: 2000,
    });
    expect(m.snapshot(2100, 'a').answer).toBeUndefined();
    expect(m.snapshot(2100, 'b')).toMatchObject({
      personalSkipped: false,
      endsAt: 46000,
    });
    expect(m.answer('a', command(m), 2200).status).toBe('finished');
    expect(() => m.select('a', id, 1, 2200)).toThrow();
    m.answer('b', command(m), 2300);
    expect(m.snapshot(2300).phase).toBe('reveal');
    expect(
      m.snapshot(2300).standings.find((p) => p.playerId === 'a')?.score,
    ).toBe(0);
    m.advance(5300);
    expect(m.snapshot(5300, 'a')).toMatchObject({
      phase: 'playing',
      personalSkipped: false,
      personalExpired: false,
    });
    expect(() => m.skip('a', id, 5400)).toThrow();
  });
  it('ends a solo attempt immediately and does not remove earned points', () => {
    const solo = new Match(deck, 'frames', [players[0]!], 1000, 45000, 1000);
    solo.skip('a', solo.snapshot(1000).roundId, 1500);
    expect(solo.snapshot(1500)).toMatchObject({
      phase: 'reveal',
      nextAt: 2500,
    });
    const m = new Match(deck, 'frames', players, 1000);
    m.answer('a', command(m), 1500);
    m.skip('a', m.snapshot(1500).roundId, 1600);
    expect(m.snapshot(1600, 'a').personalSkipped).toBe(false);
    expect(m.snapshot(1600).standings[0]?.score).toBe(20);
    m.skip('b', m.snapshot(1600).roundId, 1700);
    expect(m.snapshot(1700).phase).toBe('reveal');
  });

  it('keeps hints, deadlines and scores private to each player; revisits and retries are free', () => {
    const m = new Match(deck, 'frames', players, 1000);
    const id = m.snapshot(1000).roundId;
    m.select('a', id, 1, 2000);
    expect(m.snapshot(2000, 'a')).toMatchObject({
      stage: 1,
      unlockedStage: 1,
      endsAt: 41000,
      possibleScore: 16,
      image: 'frame-0-1',
    });
    expect(m.snapshot(2000, 'b')).toMatchObject({
      stage: 0,
      unlockedStage: 0,
      endsAt: 46000,
      possibleScore: 20,
      image: 'frame-0-0',
    });
    m.select('a', id, 1, 2500);
    m.select('a', id, 0, 3000);
    expect(m.snapshot(3000, 'a')).toMatchObject({
      stage: 0,
      endsAt: 41000,
      possibleScore: 16,
    });
    expect(() => m.select('a', id, 3, 3500)).toThrow();
    m.select('a', id, 1, 4000);
    expect(m.answer('a', command(m), 5000).score).toBe(16);
    expect(m.answer('b', command(m), 6000).score).toBe(14);
  });
  it('rejects answers after a personal deadline while the opponent can still answer', () => {
    const m = new Match(deck, 'frames', players, 1000);
    const id = m.snapshot(1000).roundId;
    for (let stage = 1; stage < 5; stage++) m.select('a', id, stage, 2000);
    m.advance(26000);
    expect(m.snapshot(26000, 'a')).toMatchObject({
      personalExpired: true,
      phase: 'playing',
      endsAt: 26000,
      possibleScore: 4,
    });
    expect(m.answer('a', command(m), 26000).status).toBe('finished');
    expect(() => m.select('a', id, 0, 26000)).toThrow();
    expect(m.answer('b', command(m), 27000).status).toBe('correct');
    expect(m.snapshot(27000).phase).toBe('reveal');
  });
  it('starts the next round with fresh personal hints and full time', () => {
    const m = new Match(deck, 'mix', players, 1000);
    m.select('a', m.snapshot(1000).roundId, 1, 2000);
    const old = m.snapshot(2000).roundId;
    m.answer('a', command(m), 3000);
    m.answer('b', command(m), 4000);
    m.advance(7000);
    expect(m.snapshot(7000, 'a')).toMatchObject({
      stage: 0,
      unlockedStage: 0,
      possibleScore: 20,
      endsAt: 52000,
    });
    expect(() => m.select('a', old, 1, 8000)).toThrow();
  });
  it('does not wait for a player who explicitly left, including subsequent rounds', () => {
    const m = new Match(deck, 'frames', players, 1000);
    m.answer('a', command(m), 2000);
    m.leave('b', 3000);
    expect(m.snapshot(3000).phase).toBe('reveal');
    m.advance(6000);
    m.answer('a', command(m, 'title-1'), 7000);
    expect(m.snapshot(7000).phase).toBe('reveal');
  });
  it('reveals immediately when everyone solves, then advances after three seconds', () => {
    const m = new Match(deck, 'frames', players, 1000);
    m.answer('a', command(m), 2000);
    m.answer('b', command(m, 'wrong'), 2200);
    expect(m.snapshot(2200).phase).toBe('playing');
    m.answer('b', command(m), 6000);
    expect(m.snapshot(6000)).toMatchObject({
      phase: 'reveal',
      nextAt: 9000,
      answer: { id: 'title-0' },
    });
    m.advance(8999);
    expect(m.snapshot(8999).roundNumber).toBe(1);
    m.advance(9000);
    expect(m.snapshot(9000)).toMatchObject({
      phase: 'playing',
      roundNumber: 2,
      startedAt: 9000,
    });
  });
  it('finishes a one-film solo challenge three seconds after the correct answer', () => {
    const m = new Match(deck.slice(0, 1), 'frames', players.slice(0, 1), 1000);
    m.answer('a', command(m), 2000);
    expect(m.snapshot(2000).phase).toBe('reveal');
    m.advance(5000);
    expect(m.snapshot(5000).phase).toBe('finished');
  });
  it('reveals neither answer nor future images while playing, and does not open hints automatically', () => {
    const m = new Match(deck, 'mix', players, 1000);
    const initial = m.snapshot(1000);
    expect(initial.answer).toBeUndefined();
    expect(JSON.stringify(initial)).not.toContain('title-0');
    expect(JSON.stringify(initial)).not.toContain('frame-0-1');
    m.advance(10000);
    expect(m.snapshot(10000)).toMatchObject({ stage: 0, image: 'frame-0-0' });
    m.advance(46000);
    expect(m.snapshot(46000)).toMatchObject({
      phase: 'reveal',
      answer: { id: 'title-0' },
    });
    m.advance(52000);
    expect(m.snapshot(52000)).toMatchObject({
      phase: 'playing',
      roundNumber: 2,
      mode: 'spotlight',
      image: 'crop-1-0',
    });
  });
  it('allows everyone to solve until the deadline and awards an idempotent answer only once', () => {
    const m = new Match(deck, 'frames', players, 1000);
    const c = command(m);
    const a = m.answer('a', c, 2000);
    expect(a.status).toBe('correct');
    expect(m.snapshot(2000).phase).toBe('playing');
    expect(m.answer('a', c, 3000)).toEqual(a);
    const b = m.answer('b', command(m), 4000);
    expect(b.score).toBe(a.score - 2);
    expect(
      m.snapshot(4000).standings.find((p) => p.playerId === 'a')?.score,
    ).toBe(a.score);
  });
  it('keeps cooldown in personal state, accepts on cooldown boundary, and rejects on round deadline', () => {
    const m = new Match(deck, 'frames', players, 1000);
    expect(m.answer('a', command(m, 'wrong'), 2000).status).toBe('incorrect');
    expect(m.personal('a').nextAllowedAt).toBe(5000);
    expect(m.answer('a', command(m), 4999).status).toBe('cooldown');
    expect(m.answer('a', command(m), 5000).status).toBe('correct');
    expect(m.answer('b', command(m), 46000).status).toBe('finished');
  });
  it('rejects previous-round submissions and excludes former round points from the new round', () => {
    const m = new Match(deck, 'mix', players, 1000);
    const old = command(m);
    m.answer('a', old, 2000);
    m.advance(52000);
    expect(() => m.answer('a', old, 53000)).toThrow();
    expect(m.personal('a')).toMatchObject({ solved: false, nextAllowedAt: 0 });
    expect(m.snapshot(53000).standings[0]).toMatchObject({
      roundScore: 0,
      solved: false,
    });
  });
  it('catches up after a delayed timer and finishes without an extra round', () => {
    const m = new Match(deck, 'spotlight', players, 1000);
    m.advance(154000);
    expect(m.snapshot(154000)).toMatchObject({
      phase: 'finished',
      roundNumber: 3,
    });
    expect(m.active).toBe(false);
    expect(m.advance(200000)).toBe(false);
  });
});

it('exposes personal deadlines and finishing positions while retaining the 20 point maximum', () => {
  const m = new Match(deck, 'frames', players, 1000);
  const id = m.snapshot(1000).roundId;
  m.select('b', id, 1, 1500);
  expect(
    m.snapshot(1500).standings.find((p) => p.playerId === 'b')?.deadline,
  ).toBe(41000);
  expect(m.answer('a', command(m), 2000).score).toBe(20);
  expect(m.answer('b', command(m), 3000).score).toBe(14);
  expect(
    m.snapshot(3000).standings.find((p) => p.playerId === 'b')?.finishOrder,
  ).toBe(2);
});
