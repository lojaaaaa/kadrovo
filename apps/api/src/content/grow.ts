import { config } from 'dotenv';
import { z } from 'zod';
import { CatalogStore } from './store';
import { UnofficialClient } from './unofficial';
import { prepareAutomaticFrames, prepareAutomaticPoster } from './auto-prepare';
import {
  credentialFingerprint,
  markBlocked,
  checkpointReady,
  type SyncCheckpoint,
} from './checkpoint';
config({ path: '../../.env', quiet: true });
/** Resumable local acquisition. Never changes provider permissions or enables cloud publication. */
async function main() {
  const target = z.coerce
    .number()
    .int()
    .min(3)
    .max(5000)
    .parse(process.argv[2] ?? 1500);
  const frameBudget = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000)
    .parse(process.argv[3] ?? 200);
  const maxBatches = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(process.argv[4] ?? 30);
  const key = process.env.KINOPOISK_UNOFFICIAL_API_KEY;
  if (!key) throw new Error('Не настроен KINOPOISK_UNOFFICIAL_API_KEY.');
  const store = new CatalogStore(),
    client = new UnofficialClient(key);
  const recordKey = 'growth:movies:kinopoisk-unofficial';
  const counts = async () => ({
    metadata: await store.db.title.count({ where: { category: 'movies' } }),
    frames: await store.db.title.count({
      where: { category: 'movies', puzzles: { some: { mode: 'frames' } } },
    }),
    spotlight: await store.db.title.count({
      where: { category: 'movies', puzzles: { some: { mode: 'spotlight' } } },
    }),
  });
  try {
    const old = await store.db.contentState.findUnique({
      where: { key: recordKey },
    });
    const state: SyncCheckpoint = (old?.value as unknown as SyncCheckpoint) ?? {
      lastAttempt: 0,
      index: 0,
      cursors: {},
    };
    const fingerprint = credentialFingerprint(client.provider, key);
    if (!checkpointReady(state, fingerprint))
      throw new Error(
        'Импорт ждёт восстановления квоты API. Прогресс сохранён.',
      );
    const save = () =>
      store.db.contentState.upsert({
        where: { key: recordKey },
        create: { key: recordKey, value: JSON.parse(JSON.stringify(state)) },
        update: { value: JSON.parse(JSON.stringify(state)) },
      });
    let batches = 0;
    while ((await counts()).spotlight < target && batches++ < maxBatches) {
      const page = await client.discoverPage(
        200,
        'movie',
        state.cursors.movies,
      );
      let added = 0;
      for (let offset = 0; offset < page.ids.length; offset += 4) {
        await Promise.all(
          page.ids.slice(offset, offset + 4).map(async (id) => {
            let data;
            try {
              data = client.cachedTitle(id);
            } catch {
              return;
            }
            if (!data || data.category !== 'movies') return;
            const title = await store.importTitle(data);
            if (
              (await prepareAutomaticPoster(store, title.titleId)) ===
              'published'
            )
              added++;
          }),
        );
      }
      state.lastAttempt = Date.now();
      if (page.next) state.cursors.movies = page.next;
      else delete state.cursors.movies;
      await save();
      console.log(
        JSON.stringify({
          phase: 'posters',
          batches,
          added,
          ...(await counts()),
        }),
      );
      if (!page.next) break;
    }
    // Existing stills cost no provider requests. Missing stills are fetched under an explicit budget.
    const pending = await store.db.externalId.findMany({
      where: {
        provider: client.provider,
        mediaType: 'title',
        title: { category: 'movies', puzzles: { none: { mode: 'frames' } } },
      },
      include: {
        title: {
          include: {
            assets: { where: { kind: 'still' }, take: 1, select: { id: true } },
          },
        },
      },
      orderBy: { title: { updatedAt: 'asc' } },
      take: Math.max(frameBudget, 1),
    });
    let checked = 0,
      published = 0;
    for (const item of pending) {
      if (checked >= frameBudget) break;
      checked++;
      try {
        if (!item.title.assets.length)
          await store.importStills(
            item.titleId,
            client.provider,
            await client.stills(item.value),
          );
        if ((await prepareAutomaticFrames(store, item.titleId)) === 'published')
          published++;
        await store.db.title.update({
          where: { id: item.titleId },
          data: { updatedAt: new Date() },
        });
      } catch (error) {
        if (markBlocked(state, fingerprint, error)) {
          await save();
          throw error;
        }
        console.log(JSON.stringify({ phase: 'frames', skipped: 1 }));
      }
      if (checked % 10 === 0)
        console.log(
          JSON.stringify({
            phase: 'frames',
            checked,
            published,
            ...(await counts()),
          }),
        );
    }
    const result = {
      target,
      ...(await counts()),
      checked,
      published,
      at: Date.now(),
    };
    await store.db.contentState.upsert({
      where: { key: 'growth:movies:health' },
      create: { key: 'growth:movies:health', value: result },
      update: { value: result },
    });
    console.log(JSON.stringify({ phase: 'done', ...result }));
  } catch (error) {
    // Persist API quota failures without logging the credential or provider payload.
    const old = await store.db.contentState.findUnique({
      where: { key: recordKey },
    });
    const state: SyncCheckpoint = (old?.value as unknown as SyncCheckpoint) ?? {
      lastAttempt: 0,
      index: 0,
      cursors: {},
    };
    if (markBlocked(state, credentialFingerprint(client.provider, key), error))
      await store.db.contentState.upsert({
        where: { key: recordKey },
        create: { key: recordKey, value: JSON.parse(JSON.stringify(state)) },
        update: { value: JSON.parse(JSON.stringify(state)) },
      });
    const health = {
      target,
      ...(await counts()),
      phase: state.blocked ? 'blocked' : 'interrupted',
      at: Date.now(),
      ...(state.blocked ? { resumeAfter: state.blocked.until } : {}),
    };
    await store.db.contentState.upsert({
      where: { key: 'growth:movies:health' },
      create: { key: 'growth:movies:health', value: health },
      update: { value: health },
    });
    throw error;
  } finally {
    await store.onModuleDestroy();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Импорт остановлен.');
  process.exitCode = 1;
});
