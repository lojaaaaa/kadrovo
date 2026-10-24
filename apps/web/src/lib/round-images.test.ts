import { it, expect } from 'vitest';
import { rememberRoundImage } from './round-images';
it('keeps the first thumbnail after playing several complete rounds', () => {
  let cache = new Map<string, { round: string; src: string }>();
  for (const round of ['one', 'two', 'three', 'four']) {
    for (let stage = 0; stage < 5; stage++) {
      cache = rememberRoundImage(cache, `${round}:${stage}`, {
        round,
        src: `${round}-${stage}`,
      });
      expect(cache.get(`${round}:0`)?.src).toBe(`${round}-0`);
      expect(cache.size).toBe(stage + 1);
    }
  }
  expect([...cache.keys()]).toEqual(
    [0, 1, 2, 3, 4].map((stage) => `four:${stage}`),
  );
});
