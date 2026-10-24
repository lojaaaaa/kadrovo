import { expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { RoomsController } from './rooms.controller';
import { ExperienceService } from './experience.service';
import { ContentCatalog } from '../content/catalog';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { webOrigin } from '../auth/security';
it('rejects cross-origin room mutations before identity or room creation', async () => {
  const identity = vi.fn();
  const c = new RoomsController(
    { identity } as unknown as ExperienceService,
    {} as ContentCatalog,
    {} as RoomsService,
    {} as RoomsGateway,
  );
  for (const origin of [undefined, 'https://attacker.invalid']) {
    const req = { headers: { origin }, ip: 'test' } as Request,
      res = {} as Response;
    await expect(c.create({}, req, res)).rejects.toThrow('источник');
    await expect(c.daily(req, res)).rejects.toThrow('источник');
    await expect(c.join('AAAAAAAA', {}, req, res)).rejects.toThrow('источник');
  }
  expect(identity).not.toHaveBeenCalled();
});
it('bounds repeated room creation attempts before database work', async () => {
  const c = new RoomsController(
    {} as ExperienceService,
    {} as ContentCatalog,
    {} as RoomsService,
    {} as RoomsGateway,
  );
  const req = { headers: { origin: webOrigin() }, ip: 'test' } as Request,
    res = {} as Response;
  for (let i = 0; i < 40; i++)
    await expect(c.create({}, req, res)).rejects.toThrow('Проверьте');
  await expect(c.create({}, req, res)).rejects.toThrow('Слишком много');
});
