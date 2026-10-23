import { expect, it } from 'vitest';
import { createRoomSchema } from './index';
it('rejects unsupported categories and extra server-owned fields', () => {
  expect(
    createRoomSchema.safeParse({
      nickname: 'Игрок',
      category: 'all',
      mode: 'mix',
    }).success,
  ).toBe(false);
  expect(
    createRoomSchema.safeParse({
      nickname: 'Игрок',
      category: 'series',
      mode: 'mix',
      score: 100,
    }).success,
  ).toBe(false);
  expect(
    createRoomSchema.parse({
      nickname: ' Игрок ',
      category: 'animation',
      mode: 'frames',
    }).nickname,
  ).toBe('Игрок');
});
it('accepts only supported round durations', () => {
  const room = { nickname: 'Игрок', category: 'movies', mode: 'frames' };
  for (const roundSeconds of [30, 45, 60, 90])
    expect(createRoomSchema.safeParse({ ...room, roundSeconds }).success).toBe(
      true,
    );
  for (const roundSeconds of [0, 1, 46, 999, '60'])
    expect(createRoomSchema.safeParse({ ...room, roundSeconds }).success).toBe(
      false,
    );
});
