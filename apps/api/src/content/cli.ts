import {
  checkpointReady,
  credentialFingerprint,
  markBlocked,
  readCheckpoint,
  saveCheckpoint,
} from './checkpoint';
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { CatalogStore } from './store';
import { PoiskKinoClient } from './provider';
import { UnofficialClient } from './unofficial';
import { backfillPosters, syncAutomaticCatalog } from './auto-prepare';
import { publishPuzzle } from './publish';
config({ path: '../../.env', quiet: true });
const [command, id, field, status, reference] = process.argv.slice(2);
const uuid = z.string().uuid();
const review = z.enum(['unreviewed', 'approved', 'rejected']);
async function main() {
  if (command === 'auto-posters') {
    const store = new CatalogStore();
    try {
      await backfillPosters(store);
    } finally {
      await store.onModuleDestroy();
    }
    return;
  }
  if (command === 'sync-auto' || command === 'sync-unofficial') {
    const count = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .parse(id ?? 50);
    const store = new CatalogStore();
    try {
      const client =
        command === 'sync-unofficial'
          ? new UnofficialClient(process.env.KINOPOISK_UNOFFICIAL_API_KEY ?? '')
          : new PoiskKinoClient(process.env.POISKKINO_API_KEY ?? '');
      const type = field ?? 'movie';
      const checkpoint = await readCheckpoint();
      const fingerprint = credentialFingerprint(
        client.provider,
        command === 'sync-unofficial'
          ? (process.env.KINOPOISK_UNOFFICIAL_API_KEY ?? '')
          : (process.env.POISKKINO_API_KEY ?? ''),
      );
      if (!checkpointReady(checkpoint, fingerprint))
        throw new Error(
          'Импорт приостановлен после отказа API. Продолжение после восстановления квоты или смены ключа.',
        );
      const key = client.provider + ':' + type;
      let result;
      try {
        result = await syncAutomaticCatalog(store, client, count, console.log, {
          type,
          next: status ?? checkpoint.cursors[key],
        });
      } catch (error) {
        if (markBlocked(checkpoint, fingerprint, error))
          await saveCheckpoint(checkpoint);
        throw error;
      }
      if (result.next) checkpoint.cursors[key] = result.next;
      else delete checkpoint.cursors[key];
      checkpoint.lastAttempt = Date.now();
      await saveCheckpoint(checkpoint);
      console.log(JSON.stringify(result));
    } finally {
      await store.onModuleDestroy();
    }
    return;
  }
  if (command === 'import-list') {
    const ids = z
      .array(z.string().regex(/^\d+$/))
      .min(1)
      .max(500)
      .parse(JSON.parse(await readFile(id ?? '', 'utf8')));
    const store = new CatalogStore();
    const client = new PoiskKinoClient(process.env.POISKKINO_API_KEY ?? '');
    try {
      for (const value of [...new Set(ids)]) {
        const data = await client.load(value, 1);
        console.log(JSON.stringify(await store.importTitle(data)));
      }
    } finally {
      await store.onModuleDestroy();
    }
    return;
  }
  if (command === 'import') {
    if (id !== 'poiskkino')
      throw new Error(
        'Пока поддерживается import poiskkino <ID> [страниц: 1–3].',
      );
    const data = await new PoiskKinoClient(
      process.env.POISKKINO_API_KEY ?? '',
    ).load(field ?? '', status ? Number(status) : 1);
    const store = new CatalogStore();
    try {
      console.log(JSON.stringify(await store.importTitle(data), null, 2));
    } finally {
      await store.onModuleDestroy();
    }
    return;
  }
  const store = new CatalogStore();
  try {
    if (command === 'inspect') {
      const title = await store.db.title.findUnique({
        where: { id: uuid.parse(id) },
        include: {
          assets: true,
          aliases: true,
          puzzles: { select: { id: true, mode: true, updatedAt: true } },
        },
      });
      if (!title) throw new Error('Произведение не найдено.');
      console.log(JSON.stringify(title, null, 2));
    } else if (command === 'review') {
      const assetId = uuid.parse(id);
      const kind = z.enum(['rights', 'editorial']).parse(field);
      const value = review.parse(status);
      if (
        kind === 'rights' &&
        value === 'approved' &&
        (!reference || reference.trim().length < 3)
      )
        throw new Error(
          'Укажите основание разрешения на использование изображения.',
        );
      const asset = await store.db.asset.update({
        where: { id: assetId },
        data:
          kind === 'rights'
            ? {
                rightsStatus: value,
                permissionReference: value === 'approved' ? reference : null,
              }
            : { editorialStatus: value },
      });
      console.log(
        JSON.stringify({
          assetId: asset.id,
          rightsStatus: asset.rightsStatus,
          editorialStatus: asset.editorialStatus,
        }),
      );
    } else if (command === 'publish') {
      if (!id)
        throw new Error(
          'Укажите путь к JSON с порядком кадров или областями постера.',
        );
      console.log(
        JSON.stringify(
          await publishPuzzle(store, JSON.parse(await readFile(id, 'utf8'))),
          null,
          2,
        ),
      );
    } else if (command === 'unpublish') {
      await store.db.puzzle.delete({ where: { id: uuid.parse(id) } });
      console.log(
        'Загадка снята с публикации. Обновление каталога — до 30 секунд.',
      );
    } else if (command === 'list') {
      console.log(
        JSON.stringify(
          await store.db.title.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              nameRu: true,
              category: true,
              _count: { select: { assets: true, puzzles: true } },
            },
          }),
          null,
          2,
        ),
      );
    } else
      throw new Error(
        'Команды: sync-auto [число: 1–200], import-list <JSON-массив ID>, import poiskkino <ID> [pages], list, inspect <titleId>, review <assetId> rights|editorial approved|rejected|unreviewed [основание], publish <manifest.json>, unpublish <puzzleId>.',
      );
  } finally {
    await store.onModuleDestroy();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof z.ZodError
      ? 'Некорректные аргументы или JSON-манифест.'
      : error instanceof Error
        ? error.message
        : 'Ошибка каталога.',
  );
  process.exitCode = 1;
});
