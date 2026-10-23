import { describe, expect, it } from 'vitest';
import { PlayerRound } from './round';
describe('server round rules', () => {
  it('blocks guesses for exactly three seconds after an error', () => {
    const round = new PlayerRound('a', 0, 45000);
    expect(
      round.answer({ commandId: '1', titleId: 'b', receivedAt: 1000 }).status,
    ).toBe('incorrect');
    expect(
      round.answer({ commandId: '2', titleId: 'a', receivedAt: 3999 }).status,
    ).toBe('cooldown');
    expect(
      round.answer({ commandId: '3', titleId: 'a', receivedAt: 4000 }).status,
    ).toBe('correct');
  });
  it('does not accept guesses at the deadline', () => {
    expect(
      new PlayerRound('a', 0, 45000).answer({
        commandId: '1',
        titleId: 'a',
        receivedAt: 45000,
      }).status,
    ).toBe('finished');
  });
  it('replays the same result without allowing a second correct answer', () => {
    const round = new PlayerRound('a', 0, 45000);
    const first = round.answer({
      commandId: '1',
      titleId: 'a',
      receivedAt: 1000,
    });
    expect(
      round.answer({ commandId: '1', titleId: 'b', receivedAt: 2000 }),
    ).toEqual(first);
    expect(
      round.answer({ commandId: '2', titleId: 'a', receivedAt: 3000 }).score,
    ).toBe(0);
  });
  it('awards the same predictable points without hidden time deductions', () => {
    const a = new PlayerRound('a', 0, 45000).answer({
      commandId: '1',
      titleId: 'a',
      receivedAt: 1000,
    });
    const b = new PlayerRound('a', 0, 45000).answer({
      commandId: '1',
      titleId: 'a',
      receivedAt: 10000,
    });
    expect(b.status).toBe('correct');
    expect(a.score).toBe(20);
    expect(b.score).toBe(20);
  });
});
