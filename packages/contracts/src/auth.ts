import { z } from 'zod';
export const emailInput = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Введите корректную почту.').max(254));
export const passwordInput = z
  .string()
  .min(10, 'Пароль должен содержать минимум 10 символов.')
  .max(128, 'Пароль не должен быть длиннее 128 символов.')
  .refine((v) => v.trim().length > 0, 'Пароль не может состоять из пробелов.');
export const nicknameInput = z
  .string()
  .trim()
  .min(2, 'Ник должен содержать минимум 2 символа.')
  .max(24, 'Ник не должен быть длиннее 24 символов.')
  .regex(
    /^[\p{L}\p{N}_. -]+$/u,
    'В нике доступны буквы, цифры, пробел, точка, дефис и подчёркивание.',
  );
export const registrationInput = z.object({
  email: emailInput,
  password: passwordInput,
  nickname: nicknameInput,
});
