import { expect, it } from 'vitest';
import { registrationInput } from './auth';
it('normalizes address and nickname, permits long passphrases', () => {
  expect(
    registrationInput.parse({
      email: ' A@Example.COM ',
      nickname: ' Киноман ',
      password: 'a long passphrase',
    }),
  ).toEqual({
    email: 'a@example.com',
    nickname: 'Киноман',
    password: 'a long passphrase',
  });
});
it('rejects invalid email, whitespace password, control characters and oversized names', () => {
  const valid = {
    email: 'a@example.com',
    nickname: 'Киноман',
    password: 'long password',
  };
  for (const patch of [
    { email: 'a@' },
    { password: 'short' },
    { password: '          ' },
    { nickname: 'x' },
    { nickname: 'a\nb' },
    { nickname: '<script>' },
    { nickname: 'я'.repeat(25) },
  ])
    expect(registrationInput.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
});
