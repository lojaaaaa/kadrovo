import { afterEach, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
afterEach(() => vi.unstubAllEnvs());
function setup(result: object) {
  vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
  const register = vi.fn(async () => result);
  const controller = new AuthController(
    { register } as unknown as AuthService,
    {} as OAuthService,
  );
  const req = {
    headers: { origin: 'http://localhost:3000' },
    ip: '127.0.0.1',
  } as Request;
  const res = { setHeader: vi.fn(), cookie: vi.fn() } as unknown as Response;
  return { controller, register, req, res };
}
it('registers, sets an HttpOnly session and never exposes the token in JSON', async () => {
  const account = { id: 'new', nickname: 'Киноман' };
  const { controller, register, req, res } = setup({
    token: 'session-secret',
    account,
  });
  expect(
    await controller.register(
      {
        email: ' NEW@Example.com ',
        password: 'a long password',
        nickname: ' Киноман ',
      },
      req,
      res,
    ),
  ).toEqual({ account });
  expect(register).toHaveBeenCalledWith(
    'new@example.com',
    'a long password',
    'Киноман',
  );
  expect(res.cookie).toHaveBeenCalledWith(
    'filmless_session',
    'session-secret',
    expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
  );
});
it('does not issue a session while email verification is required', async () => {
  const { controller, req, res } = setup({ message: 'Проверьте почту' });
  expect(
    await controller.register(
      {
        email: 'a@example.com',
        password: 'long password',
        nickname: 'Киноман',
      },
      req,
      res,
    ),
  ).toEqual({ message: 'Проверьте почту' });
  expect(res.cookie).not.toHaveBeenCalled();
});
it('rejects invalid fields before account creation', async () => {
  const { controller, register, req, res } = setup({});
  await expect(
    controller.register(
      { email: 'bad', password: 'short', nickname: 'x' },
      req,
      res,
    ),
  ).rejects.toThrow();
  expect(register).not.toHaveBeenCalled();
});
