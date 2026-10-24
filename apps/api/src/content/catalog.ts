import type { Response } from 'express';
import { CatalogRotation } from './rotation';
import { allowedImageUrl } from './images';
import { localContentPreview } from './approval';
import { pixelImage, pixelVersion } from './pixels';
import { collectionDefinitions, type CollectionId } from '@filmless/contracts';
import { approvalWhere } from './approval';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { readFile, stat, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type {
  CreateRoom,
  ContentAvailability,
  TitleOption,
} from '@filmless/contracts';
import { DemoCatalog, type Question } from '../game/catalog';
import { CatalogStore } from './store';
import { searchEntry, searchTitles, type SearchEntry } from '../game/search';
import { contentDirectory } from './publish';
export interface GameCatalog {
  options?(
    category: CreateRoom['category'],
    source?: 'demo' | 'catalog',
  ): TitleOption[];
  validate?(
    category: CreateRoom['category'],
    mode?: CreateRoom['mode'],
    source?: 'demo' | 'catalog',
    collection?: CollectionId,
  ): void;
  deck(
    category: CreateRoom['category'],
    mode?: CreateRoom['mode'],
    source?: 'demo' | 'catalog',
    collection?: CollectionId,
    count?: number,
    preferences?: { seen?: Record<string, number>; tastes?: CollectionId[] },
  ): Question[];
  byIds?(ids: string[], source: 'demo' | 'catalog'): Question[];
  search(
    category: CreateRoom['category'],
    query: string,
    source?: 'demo' | 'catalog',
  ): TitleOption[];
  has(
    id: string,
    category: CreateRoom['category'],
    source?: 'demo' | 'catalog',
  ): boolean;
}
@Injectable()
export class ContentCatalog
  implements GameCatalog, OnModuleInit, OnModuleDestroy
{
  private readonly rotation = new CatalogRotation();
  private rotationTimer?: ReturnType<typeof setTimeout>;
  private persistRotation = false;
  private rotationWrites = Promise.resolve();
  private titles: SearchEntry[] = [];
  private questions: Question[] = [];
  private readonly mediaSecret = randomBytes(32);
  private media = new Map<string, { path: string; pixel?: number }>();
  private pixelCache = new Map<string, Buffer>();
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private ready = false;
  private readonly logger = new Logger(ContentCatalog.name);
  constructor(
    @Inject(DemoCatalog) private readonly demo: DemoCatalog,
    @Inject(CatalogStore) private readonly store: CatalogStore,
  ) {}
  async onModuleInit() {
    try {
      const state = await this.store.db.contentState.findUnique({
        where: { key: 'rotation' },
      });
      if (state) this.rotation.restore(state.value);
      else
        this.rotation.restore(
          JSON.parse(
            await readFile(join(contentDirectory(), 'rotation.json'), 'utf8'),
          ),
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger.warn('История выбора недоступна; начинаем новую ротацию.');
    }
    this.persistRotation = true;
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.rotationTimer) clearTimeout(this.rotationTimer);
    if (this.persistRotation) await this.saveRotation();
  }
  private saveRotation() {
    const raw = JSON.stringify(this.rotation.snapshot());
    this.rotationWrites = this.rotationWrites
      .then(async () => {
        await this.store.db.contentState.upsert({
          where: { key: 'rotation' },
          create: { key: 'rotation', value: JSON.parse(raw) },
          update: { value: JSON.parse(raw) },
        });
        const dir = contentDirectory();
        await mkdir(dir, { recursive: true });
        const file = join(dir, 'rotation.json');
        await writeFile(file + '.tmp', raw);
        await rename(file + '.tmp', file);
      })
      .catch(() => {
        this.logger.warn('Не удалось сохранить историю выбора фильмов.');
      });
    return this.rotationWrites;
  }
  private scheduleRotation() {
    if (!this.persistRotation || this.rotationTimer) return;
    this.rotationTimer = setTimeout(() => {
      this.rotationTimer = undefined;
      void this.saveRotation();
    }, 1000);
    this.rotationTimer.unref();
  }
  validate(
    category: CreateRoom['category'],
    mode: CreateRoom['mode'] = 'frames',
    source: 'demo' | 'catalog' = 'demo',
    collection: CollectionId = 'all',
  ) {
    if (source === 'demo') return;
    if (this.eligible(category, mode, collection).length < 3)
      throw new Error(
        'Для выбранного режима нужны хотя бы три доступных фильма.',
      );
  }
  async refresh() {
    if (this.busy) return;
    this.busy = true;
    try {
      const storedFiles = new Set(
        (
          await this.store.db.contentFile.findMany({ select: { key: true } })
        ).map((f) => f.key),
      );
      const rows = await this.store.db.title.findMany({
        take: 15000,
        orderBy: { createdAt: 'asc' },
        include: {
          aliases: true,
          assets: {
            where: {
              kind: 'poster',
              editorialStatus: { not: 'rejected' },
              ...(localContentPreview()
                ? { rightsStatus: { not: 'rejected' as const } }
                : {
                    rightsStatus: 'approved' as const,
                    permissionReference: { not: null },
                  }),
            },
            take: 1,
            orderBy: { retrievedAt: 'desc' },
          },
        },
      });
      const metadata = await this.store.db.contentState.findMany({
        where: { key: { startsWith: 'metadata:' } },
        take: 15000,
      });
      const genres = new Map(
        metadata.map((r) => [
          r.key.slice(9),
          (r.value as { genres?: string[] })?.genres ?? [],
        ]),
      );
      const published = await this.store.db.puzzle.findMany({
        take: 20000,
        orderBy: { updatedAt: 'desc' },
        include: { title: true },
      });
      const assets = await this.store.db.asset.findMany({
        where: {
          id: { in: [...new Set(published.flatMap((p) => p.sourceAssetIds))] },
          ...approvalWhere(),
        },
        select: { id: true, titleId: true, kind: true },
      });
      const allowedAssets = new Map(assets.map((a) => [a.id, a]));
      const byTitle = new Map<string, Question>();
      const nextMedia = new Map<string, { path: string; pixel?: number }>();
      const register = (file: string, version: string, pixel?: number) => {
        const key = createHmac('sha256', this.mediaSecret)
          .update(file + ':' + version + ':' + String(pixel))
          .digest('hex');
        nextMedia.set(key, { path: join(contentDirectory(), file), pixel });
        return '/api/content/image/' + key;
      };
      for (const p of published) {
        try {
          const expected = p.mode === 'frames' ? 5 : 1;
          if (
            p.stageFiles.length !== 5 ||
            p.sourceAssetIds.length !== expected ||
            new Set(p.sourceAssetIds).size !== expected
          )
            continue;
          const allowed = p.sourceAssetIds.filter((id) => {
            const a = allowedAssets.get(id);
            return (
              a?.titleId === p.titleId &&
              a.kind === (p.mode === 'frames' ? 'still' : 'poster')
            );
          }).length;
          if (allowed !== expected) continue;
          const images = await Promise.all(
            p.stageFiles.map(async (file) => {
              if (!/^[a-f0-9-]{36}\/[0-4]\.webp$/.test(file))
                throw new Error('Invalid asset path');
              const path = join(contentDirectory(), file);
              const bytes = storedFiles.has(file) ? 0 : (await stat(path)).size;
              if (bytes > 2_000_000) throw new Error('Image budget exceeded');
              return register(file, p.updatedAt.toISOString());
            }),
          );
          const posterUrl = safePoster(
            rows.find((r) => r.id === p.titleId)?.assets[0]?.sourceUrl,
          );
          const q = byTitle.get(p.titleId) ?? {
            title: {
              genres: genres.get(p.title.id),
              id: p.title.id,
              name: p.title.nameRu,
              year: p.title.year,
              category: p.title.category,
              posterUrl,
            },
            frames: [],
            spotlight: [],
            demo: false,
          };
          q[p.mode] = images;
          if (p.mode === 'frames')
            q.pixels = [0, 1, 2, 3, 4].map((stage) =>
              register(
                p.stageFiles[0]!,
                `${p.updatedAt.toISOString()}:${pixelVersion}`,
                stage,
              ),
            );
          byTitle.set(p.titleId, q);
        } catch {
          this.logger.warn(
            'Пропущена загадка с недоступными подготовленными изображениями.',
          );
        }
      }
      // Atomic swap; an already running match retains its immutable deck.
      this.titles = rows.map((t) =>
        searchEntry(
          {
            genres: genres.get(t.id),
            id: t.id,
            name: t.nameRu,
            posterUrl: safePoster(t.assets[0]?.sourceUrl),
            year: t.year,
            category: t.category,
          },
          [t.originalName ?? '', ...t.aliases.map((a) => a.value)],
        ),
      );
      const searchableIds = new Set(this.titles.map((t) => t.option.id));
      for (const q of byTitle.values())
        if (!searchableIds.has(q.title.id)) {
          this.titles.push(searchEntry(q.title));
          searchableIds.add(q.title.id);
        }
      this.questions = [...byTitle.values()];
      this.media = nextMedia;
      for (const key of this.pixelCache.keys())
        if (!nextMedia.has(key)) this.pixelCache.delete(key);
      this.ready = true;
    } catch {
      this.ready = false;
      this.questions = [];
      this.logger.warn(
        'Кинокаталог недоступен. Демоподборка продолжает работать.',
      );
    } finally {
      this.busy = false;
    }
  }
  private async readMedia(path: string) {
    try {
      return await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const row = await this.store.db.contentFile.findUnique({
        where: { key: relative(contentDirectory(), path) },
      });
      if (!row) throw new NotFoundException('Изображение недоступно.');
      return Buffer.from(row.bytes);
    }
  }
  async image(key: string) {
    const media = this.media.get(key);
    if (!media) throw new NotFoundException('Изображение недоступно.');
    if (media.pixel === undefined) return this.readMedia(media.path);
    let cached = this.pixelCache.get(key);
    if (!cached) {
      cached = await pixelImage(await this.readMedia(media.path), media.pixel);
      if (this.pixelCache.size >= 64)
        this.pixelCache.delete(this.pixelCache.keys().next().value!);
      this.pixelCache.set(key, cached);
    }
    return cached;
  }
  async daily() {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const available = this.eligible('movies', 'frames');
    if (!this.ready || !available.length)
      throw new Error('Фильм дня пока недоступен. Попробуйте позже.');
    const history = await this.store.db.dailyChallenge.findMany({
      where: { day: { lt: day } },
      orderBy: { day: 'desc' },
    });
    const lastSeen = new Map<string, string>();
    for (const entry of history)
      if (!lastSeen.has(entry.titleId)) lastSeen.set(entry.titleId, entry.day);
    const chosen = [...available].sort(
      (a, b) =>
        (lastSeen.get(a.title.id) ?? '').localeCompare(
          lastSeen.get(b.title.id) ?? '',
        ) ||
        createHash('sha256')
          .update(day + a.title.id)
          .digest('hex')
          .localeCompare(
            createHash('sha256')
              .update(day + b.title.id)
              .digest('hex'),
          ),
    )[0]!;
    const record = await this.store.db.dailyChallenge.upsert({
      where: { day },
      create: { day, titleId: chosen.title.id },
      update: {},
    });
    const question = available.find((q) => q.title.id === record.titleId);
    if (!question) throw new Error('Сегодняшняя загадка временно недоступна.');
    return { day, question };
  }
  private eligible(
    category: CreateRoom['category'],
    mode: CreateRoom['mode'],
    collection: CollectionId = 'all',
  ) {
    const list = collectionDefinitions.find((c) => c.id === collection)!;
    return this.questions.filter(
      (q) =>
        q.title.category === category &&
        !(
          q.title.category === 'animation' &&
          /(?:^|[\s.:—-])(?:серии|эпизоды|сборник|новый сезон)(?:[\s.:—-]|$)/iu.test(
            q.title.name,
          )
        ) &&
        (q.title.year === null ||
          q.title.year <= new Date().getUTCFullYear()) &&
        (collection === 'all' ||
          (q.title.year !== null &&
            q.title.year >= list.from &&
            q.title.year <= list.to)) &&
        (mode === 'pixels'
          ? q.pixels?.length === 5
          : mode === 'frames'
            ? q.frames.length === 5
            : mode === 'spotlight'
              ? q.spotlight.length === 5
              : q.frames.length === 5 && q.spotlight.length === 5),
    );
  }
  availability(): ContentAvailability {
    return {
      ready: this.ready,
      collections: collectionDefinitions.map((c) => ({
        id: c.id,
        categories: (['movies', 'series', 'animation'] as const).map(
          (category) => ({
            category,
            pixels: this.eligible(category, 'pixels', c.id).length,
            frames: this.eligible(category, 'frames', c.id).length,
            spotlight: this.eligible(category, 'spotlight', c.id).length,
            mix: this.eligible(category, 'mix', c.id).length,
          }),
        ),
      })),
      categories: (['movies', 'series', 'animation'] as const).map(
        (category) => ({
          category,
          pixels: this.eligible(category, 'pixels').length,
          frames: this.eligible(category, 'frames').length,
          spotlight: this.eligible(category, 'spotlight').length,
          mix: this.eligible(category, 'mix').length,
        }),
      ),
    };
  }
  deck(
    category: CreateRoom['category'],
    mode: CreateRoom['mode'] = 'frames',
    source: 'demo' | 'catalog' = 'demo',
    collection: CollectionId = 'all',
    count = 3,
    preferences?: { seen?: Record<string, number>; tastes?: CollectionId[] },
  ) {
    if (source === 'demo')
      return this.demo.deck(category, mode, source, collection, count);
    let deck = this.eligible(category, mode, collection);
    if (preferences?.tastes?.length) {
      const lists = collectionDefinitions.filter((c) =>
        preferences.tastes!.includes(c.id),
      );
      const filtered = deck.filter((q) =>
        lists.some(
          (c) =>
            q.title.year !== null &&
            q.title.year >= c.from &&
            q.title.year <= c.to,
        ),
      );
      if (filtered.length >= 3) deck = filtered;
    }

    if (deck.length < 3)
      throw new Error(
        'Для выбранных категории и режима нужны хотя бы три опубликованные загадки.',
      );
    const total = Number.isInteger(count) && count > 0 ? count : 3;
    const lists = collectionDefinitions.filter((c) =>
      preferences?.tastes?.includes(c.id),
    );
    const affinity = (q: Question) =>
      lists.reduce(
        (n, c) =>
          n +
          (q.title.year !== null &&
          q.title.year >= c.from &&
          q.title.year <= c.to
            ? preferences!.tastes!.filter((v) => v === c.id).length
            : 0),
        0,
      );
    const result = this.rotation.pick(
      deck,
      Math.min(total, deck.length),
      (a, b) =>
        Number(!!preferences?.seen?.[a.title.id]) -
          Number(!!preferences?.seen?.[b.title.id]) ||
        affinity(b) - affinity(a) ||
        (preferences?.seen?.[a.title.id] ?? 0) -
          (preferences?.seen?.[b.title.id] ?? 0),
    );
    this.scheduleRotation();
    return result;
  }
  byIds(ids: string[], source: 'demo' | 'catalog') {
    const pool = source === 'demo' ? this.demo.byIds(ids) : this.questions;
    return ids.map((id) => {
      const q = pool.find((q) => q.title.id === id);
      if (!q) throw new Error('Один из фильмов пока недоступен.');
      return q;
    });
  }
  options(
    category: CreateRoom['category'],
    source: 'demo' | 'catalog' = 'catalog',
  ) {
    return source === 'demo'
      ? this.demo.options(category)
      : this.titles.map((t) => t.option).filter((t) => t.category === category);
  }
  search(
    category: CreateRoom['category'],
    query: string,
    source: 'demo' | 'catalog' = 'demo',
  ) {
    if (source === 'demo') return this.demo.search(category, query);
    return searchTitles(this.titles, category, query);
  }
  has(
    id: string,
    category: CreateRoom['category'],
    source: 'demo' | 'catalog' = 'demo',
  ) {
    return source === 'demo'
      ? this.demo.has(id, category)
      : this.titles.some(
          (t) => t.option.id === id && t.option.category === category,
        );
  }
}
@Controller('content')
export class ContentController {
  constructor(
    @Inject(CatalogStore) private readonly store: CatalogStore,
    @Inject(ContentCatalog) private readonly catalog: ContentCatalog,
  ) {}
  @Get('image/:key') async image(
    @Param('key') key: string,
    @Res() res: Response,
  ) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new NotFoundException();
    const image = await this.catalog.image(key);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('image/webp').send(image);
  }
  @Get('health') async health() {
    const state = await this.store.db.contentState.findUnique({
      where: { key: 'catalog-health' },
    });
    return {
      ready: this.catalog.availability().ready,
      titles:
        this.catalog.options('movies').length +
        this.catalog.options('series').length +
        this.catalog.options('animation').length,
      categories: this.catalog.availability().categories,
      lastImport: state?.value ?? null,
    };
  }
  @Get('availability') availability() {
    return this.catalog.availability();
  }
}

function safePoster(value?: string) {
  if (!value) return undefined;
  try {
    return allowedImageUrl(value).toString();
  } catch {
    return undefined;
  }
}
