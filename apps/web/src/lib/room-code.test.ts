import { expect, it } from 'vitest';
import { parseRoomCode } from './room-code';
it('accepts codes and invitation URLs but never navigates to the supplied host', () => {
  expect(parseRoomCode(' ab12cd34 ')).toBe('AB12CD34');
  expect(parseRoomCode('http://localhost:3000/room/AB12CD34')).toBe('AB12CD34');
  expect(parseRoomCode('https://other.example/room/AB12CD34?x=1')).toBe(
    'AB12CD34',
  );
  for (const input of [
    'javascript:alert(1)',
    'AB12',
    'https://x.test/not-a-room',
    'https://x.test/room/AB12CD34/extra',
  ])
    expect(parseRoomCode(input)).toBeNull();
});
