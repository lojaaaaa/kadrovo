import { z } from 'zod';
import type { CreateRoom } from '@filmless/contracts';
import { normalizeTitle } from '../game/search';
export { normalizeTitle } from '../game/search';
const text = z.string().trim().min(1).max(1000);
const movieSchema = z.object({
  id: z.number().int().positive(),
  name: text,
  type: z.enum(['movie', 'tv-series', 'cartoon', 'animated-series', 'anime']),
  year: z.number().int().min(1880).max(2200).nullish(),
  isSeries: z.boolean().nullish(),
  enName: z.string().trim().max(1000).nullish(),
  alternativeName: z.string().trim().max(1000).nullish(),
  names: z.array(z.object({ name: z.string().nullish() })).nullish(),
  poster: z.object({ url: z.string().nullish() }).nullish(),
});
const imagesSchema = z.object({
  docs: z
    .array(
      z.object({
        url: z.string(),
        type: z.string(),
        width: z.number().int().min(0).nullish(),
        height: z.number().int().min(0).nullish(),
      }),
    )
    .max(100),
  hasNext: z.boolean().optional(),
  next: z.string().nullable().optional(),
});
export type ImportedTitle = {
  provider: 'poiskkino' | 'kinopoisk-unofficial';
  externalId: string;
  nameRu: string;
  originalName: string | null;
  year: number | null;
  category: CreateRoom['category'];
  isSeries: boolean;
  aliases: string[];
  assets: {
    sourceUrl: string;
    kind: 'poster' | 'still' | 'backdrop';
    sourceType: string;
    width: number | null;
    height: number | null;
  }[];
  hasMoreImages: boolean;
};
export async function limitedBody(response: Response, limit: number) {
  if (Number(response.headers.get('content-length')) > limit)
    throw new Error('Ответ превышает допустимый размер.');
  if (!response.body) throw new Error('Пустой ответ источника.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Ответ превышает допустимый размер.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
function sourceUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw new Error('Источник должен использовать HTTPS без учётных данных.');
  return u.toString();
}
export function mapPoiskKino(movie: unknown, pages: unknown[]): ImportedTitle {
  const m = movieSchema.parse(movie);
  const images = pages.map((p) => imagesSchema.parse(p));
  const category =
    m.type === 'cartoon' || m.type === 'animated-series' || m.type === 'anime'
      ? 'animation'
      : m.type === 'tv-series'
        ? 'series'
        : 'movies';
  const assets: ImportedTitle['assets'] = [];
  if (m.poster?.url)
    assets.push({
      sourceUrl: sourceUrl(m.poster.url),
      kind: 'poster',
      sourceType: 'poster',
      width: null,
      height: null,
    });
  for (const page of images)
    for (const i of page.docs) {
      const kind = ['frame', 'still', 'screenshot'].includes(i.type)
        ? 'still'
        : i.type === 'backdrops'
          ? 'backdrop'
          : null;
      if (kind)
        assets.push({
          sourceUrl: sourceUrl(i.url),
          kind,
          sourceType: i.type,
          width: i.width || null,
          height: i.height || null,
        });
    }
  const aliases = [
    m.name,
    m.alternativeName,
    m.enName,
    ...(m.names ?? []).map((n) => n.name),
  ]
    .filter((v): v is string => typeof v === 'string' && !!normalizeTitle(v))
    .slice(0, 100);
  return {
    provider: 'poiskkino',
    externalId: String(m.id),
    nameRu: m.name,
    originalName: m.alternativeName || m.enName || null,
    year: m.year ?? null,
    category,
    isSeries: m.isSeries ?? ['tv-series', 'animated-series'].includes(m.type),
    aliases: [...new Map(aliases.map((a) => [normalizeTitle(a), a])).values()],
    assets: [...new Map(assets.map((a) => [a.sourceUrl, a])).values()],
    hasMoreImages: images.at(-1)?.hasNext ?? false,
  };
}
export class PoiskKinoClient {
  readonly provider = 'poiskkino' as const;
  constructor(
    private readonly key: string,
    private readonly request: typeof fetch = fetch,
  ) {}
  async discover(limit: number) {
    return (await this.discoverPage(limit)).ids;
  }
  async discoverPage(limit: number, type = 'movie', next?: string) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !['movie', 'tv-series', 'cartoon'].includes(type)
    )
      throw new Error('Некорректные параметры импорта.');
    if (!this.key) throw new Error('Нужен POISKKINO_API_KEY.');
    const query = new URLSearchParams({
      limit: String(limit),
      type,
      sortField: 'votes.kp',
      sortType: '-1',
      notNullFields: 'name',
    });
    if (next) query.set('next', next);
    const response = await this.request(
      `https://api.poiskkino.dev/v1.5/movie?${query}`,
      {
        headers: { 'X-API-KEY': this.key },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error(`ПоискКино: HTTP ${response.status}.`);
    const result = z
      .object({
        docs: z.array(z.object({ id: z.number().int().positive() })),
        next: z.string().nullish(),
        hasNext: z.boolean().optional(),
      })
      .parse(JSON.parse((await limitedBody(response, 8_000_000)).toString()));
    return {
      ids: [...new Set(result.docs.map((d) => String(d.id)))],
      next: result.hasNext ? (result.next ?? undefined) : undefined,
    };
  }
  async load(id: string, maxPages = 1): Promise<ImportedTitle> {
    if (!/^\d{1,12}$/.test(id))
      throw new Error('Нужен числовой ID произведения.');
    if (!this.key)
      throw new Error(
        'Добавьте POISKKINO_API_KEY в локальный .env. Не отправляйте ключ в чат.',
      );
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3)
      throw new Error('Допустимо от 1 до 3 страниц изображений.');
    const get = async (path: string) => {
      const response = await this.request(`https://api.poiskkino.dev${path}`, {
        headers: { 'X-API-KEY': this.key },
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok)
        throw new Error(
          `ПоискКино: HTTP ${response.status}. Проверьте ключ, лимит и ID.`,
        );
      return JSON.parse(
        (await limitedBody(response, 2_000_000)).toString(),
      ) as unknown;
    };
    try {
      const movie = await get(`/v1.5/movie/${id}`);
      const pages: unknown[] = [];
      let next: string | undefined;
      for (let i = 0; i < maxPages; i++) {
        const query = new URLSearchParams({ movieId: id, limit: '50' });
        for (const type of ['frame', 'still', 'screenshot'])
          query.append('type', type);
        if (next) query.set('next', next);
        const page = imagesSchema.parse(await get(`/v1.5/image?${query}`));
        pages.push(page);
        if (!page.hasNext || !page.next) break;
        next = page.next;
      }
      const result = mapPoiskKino(movie, pages);
      if (result.externalId !== id)
        throw new Error('Источник вернул другой ID.');
      return result;
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new Error(
          'Формат ответа ПоискКино изменился или карточка не содержит названия.',
        );
      if (error instanceof Error && error.message.startsWith('ПоискКино:'))
        throw error;
      throw new Error(
        'Не удалось получить корректные данные ПоискКино. Проверьте соединение и документацию API.',
      );
    }
  }
}
