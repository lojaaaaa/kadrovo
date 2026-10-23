import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { limitedBody, type ImportedTitle } from './provider';
const movie = z.object({
  kinopoiskId: z.number().int().positive(),
  nameRu: z.string().nullish(),
  nameOriginal: z.string().nullish(),
  nameEn: z.string().nullish(),
  year: z.number().int().nullish(),
  type: z.string(),
  posterUrl: z.string().nullish(),
  genres: z.array(z.object({ genre: z.string() })).default([]),
});
export class UnofficialClient {
  readonly provider = 'kinopoisk-unofficial' as const;
  private discovered = new Map<string, z.infer<typeof movie>>();
  constructor(
    private key: string,
    private request: typeof fetch = fetch,
  ) {}
  private async get(path: string) {
    const send = () =>
      this.request('https://kinopoiskapiunofficial.tech' + path, {
        headers: { 'X-API-KEY': this.key },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    let response: Response;
    try {
      response = await send();
    } catch (error) {
      if (
        !(error instanceof TypeError) &&
        !(error instanceof Error && error.name === 'TimeoutError')
      )
        throw error;
      await delay(500);
      response = await send();
    }
    if (!response.ok)
      throw new Error(`Кинопоиск Unofficial: HTTP ${response.status}.`);
    return JSON.parse(
      (await limitedBody(response, 4000000)).toString(),
    ) as unknown;
  }
  async discoverPage(limit: number, type = 'movie', next?: string) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !['movie', 'tv-series', 'cartoon'].includes(type)
    )
      throw new Error('Некорректный размер импорта');
    const shards: ({ collection: string } | { from: number; to: number })[] =
      type === 'movie' ? [{ collection: 'TOP_250_MOVIES' }] : [];
    for (let from = 2025; from >= 1900; from -= 5)
      shards.push({ from, to: from + 4 });
    const match = next?.match(/^v2:(\d+):(\d+)$/);
    let shard = match ? Number(match[1]) : 0;
    let page = match ? Number(match[2]) : next ? Number(next) : 1;
    if (
      !Number.isInteger(shard) ||
      !Number.isInteger(page) ||
      shard < 0 ||
      shard >= shards.length ||
      page < 1 ||
      page > 1000
    )
      throw new Error('Некорректная страница');
    const ids: string[] = [];
    for (
      let batch = 0;
      batch < Math.ceil(limit / 20) && shard < shards.length;
      batch++
    ) {
      const source = shards[shard]!;
      const params = new URLSearchParams({ page: String(page) });
      let path = '/api/v2.2/films';
      if ('collection' in source) {
        path += '/collections';
        params.set('type', source.collection);
      } else {
        params.set('order', 'NUM_VOTE');
        params.set('type', type === 'tv-series' ? 'TV_SERIES' : 'FILM');
        params.set('yearFrom', String(source.from));
        params.set(
          'yearTo',
          String(Math.min(source.to, new Date().getUTCFullYear())),
        );
        if (type === 'cartoon') params.set('genres', '18');
      }
      const result = z
        .object({ totalPages: z.number().int(), items: z.array(movie) })
        .parse(await this.get(path + '?' + params));
      for (const item of result.items)
        this.discovered.set(String(item.kinopoiskId), item);
      ids.push(...result.items.map((m) => String(m.kinopoiskId)));
      if (page < result.totalPages) page++;
      else {
        shard++;
        page = 1;
      }
    }
    return {
      ids: [...new Set(ids)],
      next: shard < shards.length ? `v2:${shard}:${page}` : undefined,
    };
  }
  async load(id: string): Promise<ImportedTitle> {
    if (!/^\d{1,12}$/.test(id)) throw new Error('Некорректный ID');
    const title =
      this.discovered.get(id) ??
      movie.parse(await this.get('/api/v2.2/films/' + id));
    const images = z
      .object({ items: z.array(z.object({ imageUrl: z.string() })) })
      .parse(await this.get(`/api/v2.2/films/${id}/images?type=STILL&page=1`));
    return this.metadata(title, images.items);
  }
  cachedTitle(id: string) {
    const title = this.discovered.get(id);
    return title ? this.metadata(title, []) : undefined;
  }
  private metadata(
    title: z.infer<typeof movie>,
    items: { imageUrl: string }[],
  ): ImportedTitle {
    const id = String(title.kinopoiskId);
    const name = title.nameRu || title.nameOriginal || title.nameEn;
    if (!name) throw new Error('У фильма нет названия');
    const animation = title.genres.some((g) =>
      ['мультфильм', 'аниме'].includes(g.genre),
    );
    return {
      provider: this.provider,
      externalId: id,
      nameRu: name,
      originalName: title.nameOriginal ?? title.nameEn ?? null,
      year: title.year ?? null,
      category: animation
        ? 'animation'
        : title.type === 'FILM'
          ? 'movies'
          : 'series',
      isSeries: title.type !== 'FILM',
      aliases: [title.nameRu, title.nameOriginal, title.nameEn].filter(
        (s): s is string => !!s,
      ),
      hasMoreImages: false,
      assets: [
        ...(title.posterUrl
          ? [
              {
                sourceUrl: title.posterUrl,
                kind: 'poster' as const,
                sourceType: 'poster',
                width: null,
                height: null,
              },
            ]
          : []),
        ...items.map((i) => ({
          sourceUrl: i.imageUrl,
          kind: 'still' as const,
          sourceType: 'still',
          width: null,
          height: null,
        })),
      ],
    };
  }
}
