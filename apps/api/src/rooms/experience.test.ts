import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ExperienceService } from './experience.service';
import { CatalogStore } from '../content/store';
import { AuthService } from '../auth/auth.service';
function setup() {
  const rows = new Map<string, unknown>();
  const table = {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      rows.has(where.key)
        ? { value: structuredClone(rows.get(where.key)) }
        : null,
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
      }: {
        where: { key: string };
        create: { value: unknown };
      }) => {
        rows.set(where.key, structuredClone(create.value));
        return {};
      },
    ),
  };
  const store = { db: { contentState: table } } as unknown as CatalogStore;
  const auth = { session: vi.fn(async () => null) } as unknown as AuthService;
  const req = {
    headers: { cookie: 'kadrovo_guest=' + 'a'.repeat(64) },
  } as Request;
  const res = { cookie: vi.fn() } as unknown as Response;
  return { rows, store, auth, req, res };
}
describe('persistent player experience', () => {
  it('keeps guest history across service restarts and hides daily checkpoints from summary', async () => {
    const { store, auth, req, res } = setup();
    const a = new ExperienceService(store, auth);
    const subject = await a.identity(req, res);
    a.expose(subject, 'film-1');
    a.get(subject).daily['2026-10-23'] = {
      score: 16,
      solved: true,
      session: { code: 'AAAAAAAA', token: 'secret', playerId: 'p' },
    };
    a.save(subject);
    await a.onModuleDestroy();
    const b = new ExperienceService(store, auth);
    expect(await b.identity(req, res)).toBe(subject);
    expect(b.summary(subject).seen).toBe(1);
    expect(b.summary(subject).daily).toEqual([
      { day: '2026-10-23', score: 16, solved: true },
    ]);
    expect(JSON.stringify(b.summary(subject))).not.toContain('secret');
  });
  it('merges guest history into an account without replacing its existing first daily result', async () => {
    const { store, auth, req, res } = setup();
    const service = new ExperienceService(store, auth);
    const guest = await service.identity(req, res);
    service.expose(guest, 'film');
    service.get(guest).daily['2026-10-22'] = { score: 0, solved: false };
    vi.mocked(auth.session).mockResolvedValue({
      id: 'user',
      nickname: 'Имя',
    } as Awaited<ReturnType<AuthService['session']>>);
    const account = await service.identity(req, res);
    expect(account).toBe('account:user');
    expect(service.get(account).seen.film).toBeDefined();
    service.get(account).daily['2026-10-22'] = { score: 20, solved: true };
    await service.identity(req, res);
    expect(service.get(account).daily['2026-10-22']?.score).toBe(20);
    await service.onModuleDestroy();
  });
});
it('does not evict the history of an active room when many guests visit', async () => {
  const { store, auth, req, res } = setup();
  const service = new ExperienceService(store, auth);
  const active = await service.identity(req, res);
  service.expose(active, 'kept');
  service.retain(active);
  for (let i = 0; i < 5002; i++)
    await service.identity(
      {
        headers: {
          cookie: 'kadrovo_guest=' + i.toString(16).padStart(64, '0'),
        },
      } as Request,
      res,
    );
  expect(service.get(active).seen.kept).toBeDefined();
  service.release(active);
  await service.onModuleDestroy();
});
it('reports daily state without leaking the saved session and rolls over at Moscow midnight', async () => {
  const { store, auth, req, res } = setup();
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-24T20:59:59Z'));
    const service = new ExperienceService(store, auth);
    const id = await service.identity(req, res);
    expect(service.summary(id).currentDaily.status).toBe('new');
    service.get(id).daily['2026-10-24'] = {
      session: { code: 'AAAAAAAA', token: 'secret', playerId: 'p' },
    };
    expect(service.summary(id).currentDaily.status).toBe('in-progress');
    service.get(id).daily['2026-10-24']!.score = 0;
    expect(service.summary(id).currentDaily.status).toBe('completed');
    expect(JSON.stringify(service.summary(id))).not.toContain('secret');
    vi.setSystemTime(new Date('2026-10-24T21:00:00Z'));
    expect(service.summary(id).currentDaily).toMatchObject({
      day: '2026-10-25',
      status: 'new',
    });
    await service.onModuleDestroy();
  } finally {
    vi.useRealTimers();
  }
});

it('persists independent guest allowances and counts each actual match only once', async () => {
  const f = setup();
  const service = new ExperienceService(f.store, f.auth);
  const subject = await service.identity(f.req, f.res);
  for (let i = 0; i < 5; i++) service.useTrial(subject, 'solo', 'solo-' + i);
  service.useTrial(subject, 'solo', 'solo-0');
  expect(service.summary(subject).access).toMatchObject({
    guest: true,
    soloRemaining: 0,
    onlineRemaining: 3,
  });
  expect(() => service.assertTrial(subject, 'solo')).toThrow('Гостевые игры');
  for (let i = 0; i < 3; i++)
    service.useTrial(subject, 'online', 'online-' + i);
  expect(() => service.useTrial(subject, 'online', 'fourth')).toThrow(
    'Гостевые игры',
  );
  expect(() => service.assertTrial('account:signed-in', 'solo')).not.toThrow();
  await service.onModuleDestroy();
  const restored = new ExperienceService(f.store, f.auth);
  await restored.identity(f.req, f.res);
  expect(restored.summary(subject).access).toMatchObject({
    soloRemaining: 0,
    onlineRemaining: 0,
  });
  expect(() => restored.useTrial(subject, 'solo', 'sixth')).toThrow();
  await restored.onModuleDestroy();
});

it('does not charge waiting, cancellation or reconnects; charges both guests when a match really starts', async () => {
  const { RoomsService } = await import('./rooms.service');
  const { BattleService } = await import('./battle.service');
  const f = setup();
  const experience = new ExperienceService(f.store, f.auth);
  const one = await experience.identity(f.req, f.res);
  const two = await experience.identity(
    { headers: { cookie: 'kadrovo_guest=' + 'b'.repeat(64) } } as Request,
    f.res,
  );
  const question = {
    title: {
      id: 'film',
      name: 'Film',
      year: 2000,
      category: 'movies' as const,
    },
    frames: Array(5).fill('image'),
    spotlight: Array(5).fill('poster'),
  };
  const rooms = new RoomsService(
    { deck: () => [question], search: () => [], has: () => true },
    undefined,
    experience,
  );
  const queue = new BattleService(rooms);
  const a = { id: one, subject: one, nickname: 'One' },
    b = { id: two, subject: two, nickname: 'Two' };
  queue.quickJoin(a, 'duel');
  expect(experience.summary(one).access.onlineRemaining).toBe(3);
  queue.quickCancel(one);
  expect(experience.summary(one).access.onlineRemaining).toBe(3);
  queue.quickJoin(a, 'duel');
  queue.quickJoin(b, 'duel');
  const sa = queue.quickStatus(one),
    sb = queue.quickStatus(two);
  if (!('session' in sa) || !sa.session || !('session' in sb) || !sb.session)
    throw new Error('Not matched');
  rooms.connect(sa.session.code, sa.session.token, 'one');
  expect(experience.summary(one).access.onlineRemaining).toBe(3);
  rooms.connect(sb.session.code, sb.session.token, 'two');
  expect(experience.summary(one).access.onlineRemaining).toBe(2);
  expect(experience.summary(two).access.onlineRemaining).toBe(2);
  rooms.disconnect(sa.session.code, 'one');
  rooms.connect(sa.session.code, sa.session.token, 'one-reconnected');
  expect(experience.summary(one).access.onlineRemaining).toBe(2);
  await experience.onModuleDestroy();
});
