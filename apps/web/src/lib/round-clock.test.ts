import { expect, it } from 'vitest';
import { roundClock } from './round-clock';
it('never displays the reveal pause as a new one-second answer timer after skipping', () => {
  expect(roundClock({ phase: 'playing', seconds: 37 }).value).toBe('37');
  expect(
    roundClock({ phase: 'playing', seconds: 0, skipped: true }),
  ).toMatchObject({ value: '—', label: 'Пропущено', urgent: false });
  for (const seconds of [1, 0])
    expect(
      roundClock({ phase: 'reveal', seconds, skipped: true }),
    ).toMatchObject({ value: '—', label: 'Раунд завершён', urgent: false });
  expect(roundClock({ phase: 'playing', seconds: 45 })).toMatchObject({
    value: '45',
    label: 'с',
  });
});
it('distinguishes a solved attempt and waiting for other players from an active countdown', () => {
  expect(
    roundClock({ phase: 'playing', seconds: 12, solved: true }).label,
  ).toBe('Угадано');
  expect(roundClock({ phase: 'playing', seconds: 0 }).label).toBe(
    'Ждём игроков',
  );
  expect(roundClock({ phase: 'playing', seconds: 3 }).urgent).toBe(true);
});

it('shows an ended wrong-choice attempt instead of a retry countdown', () => {
  expect(
    roundClock({ phase: 'playing', seconds: 0, wrong: true }),
  ).toMatchObject({ value: '×', label: 'Неверно', urgent: false });
});
