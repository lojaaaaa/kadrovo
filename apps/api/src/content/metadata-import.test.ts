import { expect, it, vi } from 'vitest';
import { syncAutomaticCatalog } from './auto-prepare';
import type { CatalogStore } from './store';
import type { ImportedTitle } from './provider';
function fixture() {
  const imported = vi.fn(async (t: ImportedTitle) => ({
    titleId: t.externalId,
    name: t.nameRu,
  }));
  const load = vi.fn(async (): Promise<ImportedTitle> => {
    throw new Error('HTTP 402');
  });
  const store = {
    importTitle: imported,
    db: {
      puzzle: { findUnique: async () => ({ id: 'poster' }) },
      externalId: {
        findMany: async () => [],
        findFirst: async ({ where }: { where: { value: string } }) => ({
          titleId: where.value,
          title: { nameRu: 'Film', puzzles: [], assets: [] },
        }),
      },
    },
  } as unknown as CatalogStore;
  const client = {
    provider: 'kinopoisk-unofficial' as const,
    discoverPage: async () => ({ ids: ['1', '2', '3'], next: 'v2:1:2' }),
    cachedTitle: (id: string): ImportedTitle => ({
      provider: 'kinopoisk-unofficial',
      externalId: id,
      nameRu: 'Film ' + id,
      originalName: null,
      year: 2000,
      category: 'movies',
      isSeries: false,
      aliases: [],
      assets: [],
      hasMoreImages: false,
    }),
    load,
  };
  return { store, client, imported, load };
}
it('persists every discovered title before an image request hits the quota', async () => {
  const { store, client, imported, load } = fixture();
  await expect(
    syncAutomaticCatalog(store, client, 3, () => {}),
  ).rejects.toThrow('402');
  expect(imported).toHaveBeenCalledTimes(3);
  expect(load).toHaveBeenCalledTimes(1);
});
it('supports metadata-only passes without spending per-title API requests', async () => {
  const { store, client, imported, load } = fixture();
  const result = await syncAutomaticCatalog(store, client, 3, () => {}, {
    frameBudget: 0,
  });
  expect(imported).toHaveBeenCalledTimes(3);
  expect(load).not.toHaveBeenCalled();
  expect(result.deferredFrames).toBe(3);
  expect(result.next).toBe('v2:1:2');
});
