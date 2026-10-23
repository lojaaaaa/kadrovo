import { config } from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { CatalogStore } from './store';
import { mapPoiskKino } from './provider';
import { publishPuzzle } from './publish';
import { ContentCatalog } from './catalog';
import { DemoCatalog } from '../game/catalog';
import { RoomsService } from '../rooms/rooms.service';
config({ path: '../../.env', quiet: true });
async function main() {
  const url =
    process.env.DATABASE_URL ??
    'postgresql://filmless:filmless_local@localhost:5432/filmless';
  const schema = `filmless_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: url });
  const directory = await mkdtemp(join(tmpdir(), 'filmless-content-'));
  const oldDirectory = process.env.CONTENT_DIR;
  process.env.CONTENT_DIR = directory;
  const store = new CatalogStore({ url, schema });
  let created = false;
  try {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await client.query(`SET search_path TO "${schema}"`);
      for (const migration of [
        '202610220001_catalog',
        '202610220002_puzzles',
        '202610230001_daily',
        '202610230002_automated_content',
      ])
        await client.query(
          await readFile(
            `prisma/migrations/${migration}/migration.sql`,
            'utf8',
          ),
        );
    } finally {
      client.release();
    }
    const image = await sharp({
      create: { width: 200, height: 300, channels: 3, background: '#34918c' },
    })
      .png()
      .toBuffer();
    const request: typeof fetch = async () =>
      new Response(new Uint8Array(image), {
        headers: { 'content-type': 'image/png' },
      });
    let firstId = '';
    let firstAsset = '';
    for (let i = 1; i <= 3; i++) {
      const input = mapPoiskKino(
        {
          id: i,
          name: `Тестовый фильм ${i}`,
          type: 'movie',
          year: 2020,
          names: [{ name: `Ёжик ${i}` }],
          poster: { url: `https://image.tmdb.org/${i}/poster.png` },
        },
        [
          {
            docs: Array.from({ length: 5 }, (_, j) => ({
              url: `https://image.tmdb.org/${i}/${j}.png`,
              type: 'still',
            })),
            hasNext: false,
          },
        ],
      );
      const imported = await store.importTitle(input);
      const duplicate = await store.importTitle(input);
      assert.equal(imported.titleId, duplicate.titleId);
      assert.equal(
        await store.db.asset.count({ where: { titleId: imported.titleId } }),
        6,
      );
      const crossProvider = await store.importTitle({
        ...input,
        provider: 'kinopoisk-unofficial',
        assets: [],
      });
      assert.equal(crossProvider.titleId, imported.titleId);
      const assets = await store.db.asset.findMany({
        where: { titleId: imported.titleId },
        orderBy: { sourceUrl: 'asc' },
      });
      const frameIds = assets
        .filter((a) => a.kind === 'still')
        .map((a) => a.id);
      const manifest = {
        titleId: imported.titleId,
        mode: 'frames',
        assetIds: frameIds,
      };
      await assert.rejects(
        publishPuzzle(store, manifest, { directory, request }),
        /одобренные/,
      );
      await store.db.asset.updateMany({
        where: { titleId: imported.titleId },
        data: {
          rightsStatus: 'approved',
          editorialStatus: 'approved',
          permissionReference:
            'Synthetic test fixture created by this integration test',
        },
      });
      await store.importTitle(input);
      assert.equal(
        (await store.db.asset.findUniqueOrThrow({ where: { id: frameIds[0] } }))
          .rightsStatus,
        'approved',
      );
      await publishPuzzle(store, manifest, { directory, request });
      await publishPuzzle(
        store,
        {
          titleId: imported.titleId,
          mode: 'spotlight',
          assetId: assets.find((a) => a.kind === 'poster')!.id,
          crops: [0.1, 0.2, 0.4, 0.7, 1].map((size) => ({
            x: (1 - size) / 2,
            y: (1 - size) / 2,
            width: size,
            height: size,
          })),
        },
        { directory, request },
      );
      if (i === 1) {
        firstId = imported.titleId;
        firstAsset = frameIds[0]!;
      }
    }
    const demo = new DemoCatalog();
    await demo.onModuleInit();
    const catalog = new ContentCatalog(demo, store);
    await catalog.refresh();
    const daily = await catalog.daily();
    const repeatedDaily = await catalog.daily();
    assert.equal(daily.day, repeatedDaily.day);
    assert.equal(daily.question.title.id, repeatedDaily.question.title.id);
    assert.equal(await store.db.dailyChallenge.count(), 1);
    assert.equal(catalog.availability().categories[0]?.mix, 3);
    assert.equal(catalog.search('movies', 'ежик 1', 'catalog')[0]?.id, firstId);
    assert.equal(catalog.search('series', 'ежик', 'catalog').length, 0);
    const rooms = new RoomsService(catalog);
    const a = rooms.create({
        nickname: 'А',
        category: 'movies',
        mode: 'mix',
        source: 'catalog',
      }),
      b = rooms.join(a.code, 'Б');
    rooms.connect(a.code, a.token, 'a');
    rooms.connect(b.code, b.token, 'b');
    rooms.ready(a.code, a.token, true);
    rooms.ready(a.code, b.token, true);
    rooms.start(a.code, a.token);
    const game = rooms.snapshot(a.code).game!;
    assert.equal(game.demo, false);
    assert.match(game.image, /^\/api\/content\/image\/[a-f0-9]{64}$/);
    const visibleImage = await catalog.image(game.image.split('/').pop()!);
    assert.equal((await sharp(visibleImage).metadata()).format, 'webp');
    await assert.rejects(catalog.image('0'.repeat(64)));
    const pixelDeck = catalog.deck('movies', 'pixels', 'catalog');
    const pixel = await catalog.image(
      pixelDeck[0]!.pixels![0]!.split('/').pop()!,
    );
    assert.equal((await sharp(pixel).metadata()).width, 960);
    assert.equal(game.answer, undefined);
    const second = new CatalogStore({ url, schema });
    try {
      assert.equal(await second.db.puzzle.count(), 6);
    } finally {
      await second.onModuleDestroy();
    }
    await store.db.asset.update({
      where: { id: firstAsset },
      data: { rightsStatus: 'rejected' },
    });
    await catalog.refresh();
    assert.equal(catalog.availability().categories[0]?.frames, 2);
    assert.throws(() => catalog.deck('movies', 'frames', 'catalog'));
    assert.equal(rooms.snapshot(a.code).game!.roundId, game.roundId);
    console.log(
      'Content integration passed: isolated PostgreSQL, idempotent import, approval gates, raster preparation, persistence, alias search, real-catalog match and withdrawal. No provider network requests made.',
    );
  } finally {
    await store.onModuleDestroy();
    if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
    await rm(directory, { recursive: true, force: true });
    if (oldDirectory === undefined) delete process.env.CONTENT_DIR;
    else process.env.CONTENT_DIR = oldDirectory;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
