import { describe, it, expect } from 'vitest';
import { ContentCatalog } from './catalog';
import { CatalogStore } from './store';
import { DemoCatalog } from '../game/catalog';

describe('poster pixels catalog', () => {
  it('makes poster-only films playable in pixels without requiring still frames', async () => {
    const batch = '00000000-0000-4000-8000-000000000001';
    const files = [0, 1, 2, 3, 4].map((i) => `${batch}/${i}.webp`);
    const titles = ['a', 'b', 'c'].map((id) => ({
      id,
      nameRu: id,
      year: 2000,
      category: 'movies',
      originalName: null,
      aliases: [],
      assets: [{ sourceUrl: 'https://image.tmdb.org/poster.jpg' }],
    }));
    const store = {
      db: {
        contentFile: { findMany: async () => files.map((key) => ({ key })) },
        title: { findMany: async () => titles },
        contentState: { findMany: async () => [] },
        puzzle: {
          findMany: async () =>
            titles.map((title) => ({
              titleId: title.id,
              title,
              mode: 'spotlight',
              stageFiles: files,
              sourceAssetIds: [title.id],
              updatedAt: new Date(0),
            })),
        },
        asset: {
          findMany: async () =>
            titles.map((title) => ({
              id: title.id,
              titleId: title.id,
              kind: 'poster',
            })),
        },
      },
    } as unknown as CatalogStore;
    const catalog = new ContentCatalog(new DemoCatalog(), store);
    await catalog.refresh();
    expect(
      catalog.availability().categories.find((c) => c.category === 'movies'),
    ).toEqual({
      category: 'movies',
      pixels: 3,
      frames: 0,
      spotlight: 3,
      mix: 0,
    });
    const deck = catalog.deck('movies', 'pixels', 'catalog');
    expect(deck).toHaveLength(3);
    expect(deck.every((q) => q.pixels?.length === 5 && !q.frames.length)).toBe(
      true,
    );
  });
});
