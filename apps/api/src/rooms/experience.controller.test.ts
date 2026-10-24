import { UnauthorizedException } from '@nestjs/common';
import { afterEach, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ExperienceController } from './experience.controller';
import { ExperienceService } from './experience.service';
import { RoomsService } from './rooms.service';
import { CatalogStore } from '../content/store';
import { ContentCatalog } from '../content/catalog';
import { webOrigin } from '../auth/security';
afterEach(() => vi.useRealTimers());
function setup() {
  const data = {
    watchlist: [{ id: 'retired', name: 'Old film' }],
    removedWatchlist: [],
  };
  const save = vi.fn(),
    findUnique = vi.fn(),
    findMany = vi.fn(async () => []),
    createDaily = vi.fn();
  const authenticate = vi.fn(),
    snapshot = vi.fn(() => ({ game: { phase: 'finished' }, secret: 'hidden' }));
  const controller = new ExperienceController(
    {
      identity: async () => 'guest:test',
      get: () => data,
      save,
    } as unknown as ExperienceService,
    { createDaily, authenticate, snapshot } as unknown as RoomsService,
    {
      db: { dailyChallenge: { findUnique, findMany } },
    } as unknown as CatalogStore,
    { options: () => [] } as unknown as ContentCatalog,
  );
  const req = { headers: { origin: webOrigin() } } as Request;
  const res = { setHeader: vi.fn() } as unknown as Response;
  return {
    controller,
    req,
    res,
    data,
    save,
    findUnique,
    findMany,
    createDaily,
    authenticate,
    snapshot,
  };
}
it('rejects archive requests for today before loading a film and excludes today from the list', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
  const x = setup();
  await expect(
    x.controller.archive('2026-10-24', x.req, x.res),
  ).rejects.toThrow('Архив');
  expect(x.findUnique).not.toHaveBeenCalled();
  expect(x.createDaily).not.toHaveBeenCalled();
  await x.controller.archiveList(x.req, x.res);
  expect(x.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { day: { lt: '2026-10-24' } } }),
  );
});
it('lets players remove a saved title even when it no longer exists in the current catalog', async () => {
  const x = setup();
  await x.controller.watch({ titleId: 'retired', remove: true }, x.req, x.res);
  expect(x.data.watchlist).toEqual([]);
  expect(x.data.removedWatchlist).toContain('retired');
  expect(x.save).toHaveBeenCalledOnce();
});

it('checks the room token before returning a minimal resume status', async () => {
  const x = setup(),
    body = { code: 'AAAAAAAA', token: 'a'.repeat(64) };
  expect(await x.controller.resume(body, x.req, x.res)).toEqual({
    available: true,
    phase: 'finished',
  });
  x.authenticate.mockImplementation(() => {
    throw new UnauthorizedException();
  });
  x.snapshot.mockClear();
  expect(await x.controller.resume(body, x.req, x.res)).toEqual({
    available: false,
  });
  expect(x.snapshot).not.toHaveBeenCalled();
});
