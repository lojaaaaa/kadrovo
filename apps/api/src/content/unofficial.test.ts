import { expect, it, vi } from 'vitest';
import { UnofficialClient } from './unofficial';
import { automaticCrops } from './auto-prepare';
import { validateCrops } from './images';
const title = {
  kinopoiskId: 301,
  nameRu: 'Матрица',
  nameOriginal: 'The Matrix',
  year: 1999,
  type: 'FILM',
  posterUrl: 'https://image.tmdb.org/poster.jpg',
  genres: [{ genre: 'фантастика' }],
};
it('imports metadata, Russian aliases, poster and stills directly from provider responses', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(title))
    .mockResolvedValueOnce(
      Response.json({
        items: [{ imageUrl: 'https://image.tmdb.org/still.jpg' }],
      }),
    );
  const result = await new UnofficialClient('test', request).load('301');
  expect(result).toMatchObject({
    provider: 'kinopoisk-unofficial',
    nameRu: 'Матрица',
    category: 'movies',
    externalId: '301',
  });
  expect(result.assets.map((a) => a.kind)).toEqual(['poster', 'still']);
  expect(result.aliases).toContain('The Matrix');
  expect(request).toHaveBeenCalledTimes(2);
});
it('paginates the catalog and requests real series and animation filters', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async () =>
      Response.json({ totalPages: 4, items: [title] }),
    );
  const client = new UnofficialClient('test', request);
  expect((await client.discoverPage(20, 'cartoon', '2')).next).toBe('v2:0:3');
  expect(String(request.mock.calls[0]![0])).toContain('genres=18');
  await client.discoverPage(20, 'tv-series');
  expect(String(request.mock.calls[1]![0])).toContain('type=TV_SERIES');
});
it('stops on denied or exhausted quota without retries', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('', { status: 403 }));
  await expect(
    new UnofficialClient('test', request).load('301'),
  ).rejects.toThrow('403');
  expect(request).toHaveBeenCalledTimes(1);
});
it('automatically expands a poster fragment to the whole poster', () => {
  const crops = automaticCrops();
  expect(() => validateCrops(crops)).not.toThrow();
  expect(crops[0]!.width).toBeLessThan(0.2);
  expect(crops[4]).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});
it('moves beyond one capped result set and reuses list metadata', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input).includes('/images?')
        ? Response.json({ items: [] })
        : Response.json({ totalPages: 1, items: [title] }),
    );
  const client = new UnofficialClient('test', request);
  const page = await client.discoverPage(40, 'movie');
  expect(page.next).toBe('v2:2:1');
  expect(String(request.mock.calls[0]![0])).toContain('/collections?');
  expect(String(request.mock.calls[1]![0])).toContain('yearFrom=2025');
  await client.load('301');
  expect(request).toHaveBeenCalledTimes(3); // two lists plus images, no redundant detail call
});
it('retries a transient connection failure once without retrying HTTP quota failures', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValue(Response.json({ totalPages: 1, items: [title] }));
  const page = await new UnofficialClient('test', request).discoverPage(
    20,
    'movie',
  );
  expect(page.ids).toEqual(['301']);
  expect(request).toHaveBeenCalledTimes(2);
});
