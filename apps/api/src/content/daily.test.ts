import { afterEach, expect, it, vi } from 'vitest';
import { ContentCatalog } from './catalog';
import { CatalogStore } from './store';
import { DemoCatalog } from '../game/catalog';
afterEach(() => vi.useRealTimers());
it('rotates without repeats, keeps the Moscow day stable, and prefers new films', async () => {
  vi.useFakeTimers();
  const records = new Map<string, { day: string; titleId: string }>();
  const catalog = new ContentCatalog(new DemoCatalog(), {
    db: {
      dailyChallenge: {
        findMany: async ({ where }: { where: { day: { lt: string } } }) =>
          [...records.values()]
            .filter((r) => r.day < where.day.lt)
            .sort((a, b) => b.day.localeCompare(a.day)),
        upsert: async ({
          create,
        }: {
          create: { day: string; titleId: string };
        }) => {
          if (!records.has(create.day)) records.set(create.day, create);
          return records.get(create.day)!;
        },
      },
    },
  } as unknown as CatalogStore);
  const questions = ['a', 'b', 'c'].map((id) => ({
    title: { id, name: id, category: 'movies', year: 2000 },
    frames: Array(5).fill('image'),
    spotlight: [],
  }));
  Object.assign(catalog, { questions, ready: true });
  const ids = [];
  for (let day = 1; day <= 6; day++) {
    vi.setSystemTime(new Date(`2026-10-0${day}T21:01:00Z`));
    const daily = await catalog.daily();
    expect(daily.day).toBe(`2026-10-0${day + 1}`);
    expect((await catalog.daily()).question.title.id).toBe(
      daily.question.title.id,
    );
    ids.push(daily.question.title.id);
  }
  expect(new Set(ids.slice(0, 3)).size).toBe(3);
  expect(ids.slice(3)).toEqual(ids.slice(0, 3));
  questions.push({
    ...questions[0]!,
    title: { ...questions[0]!.title, id: 'new' },
  });
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  expect((await catalog.daily()).question.title.id).toBe('new');
});
