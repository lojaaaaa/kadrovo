import { afterEach, expect, it, vi } from 'vitest';
import { api } from './account';
afterEach(() => vi.unstubAllGlobals());
it('turns an empty gateway response into a readable retry message', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 502 })),
  );
  await expect(api('auth/logout', 'POST')).rejects.toThrow(
    'Сервис временно недоступен',
  );
});
it('handles lost connections and preserves useful API validation messages', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
  await expect(api('auth/me')).rejects.toThrow('Нет связи с сервером');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ message: 'Неверная почта или пароль.' }, { status: 401 }),
    ),
  );
  await expect(api('auth/login', 'POST')).rejects.toThrow(
    'Неверная почта или пароль',
  );
});
