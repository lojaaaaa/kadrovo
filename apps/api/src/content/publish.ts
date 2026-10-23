import { approvalWhere, localContentPreview } from './approval';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { z } from 'zod';
import type { CatalogStore } from './store';
import {
  downloadImage,
  publishSchema,
  renderCrops,
  renderFrame,
} from './images';
export const contentDirectory = () =>
  resolve(process.env.CONTENT_DIR ?? '../../.data/content');
export async function publishPuzzle(
  store: CatalogStore,
  raw: unknown,
  options: { directory?: string; request?: typeof fetch } = {},
) {
  const manifest: z.infer<typeof publishSchema> = publishSchema.parse(raw);
  const ids =
    manifest.mode === 'frames' ? manifest.assetIds : [manifest.assetId];
  if (new Set(ids).size !== ids.length)
    throw new Error('Кадры должны быть разными.');
  const assets = await store.db.asset.findMany({
    where: { id: { in: ids }, titleId: manifest.titleId },
  });
  if (assets.length !== ids.length)
    throw new Error(
      'Изображения не найдены или относятся к другому произведению.',
    );
  for (const a of assets) {
    if (
      !['approved', 'automated'].includes(a.editorialStatus) ||
      a.rightsStatus === 'rejected' ||
      (!localContentPreview() &&
        (a.rightsStatus !== 'approved' || !a.permissionReference))
    )
      throw new Error(
        'Нужны одобренные права с основанием и редакторская проверка каждого изображения.',
      );
    if (manifest.mode === 'frames' ? a.kind !== 'still' : a.kind !== 'poster')
      throw new Error('Для кадров нужны still, для лупы — poster.');
  }
  const input = await Promise.all(
    ids.map((id) =>
      downloadImage(
        assets.find((a) => a.id === id)!.sourceUrl,
        options.request,
      ),
    ),
  );
  const images =
    manifest.mode === 'frames'
      ? await Promise.all(input.map(renderFrame))
      : await renderCrops(input[0]!, manifest.crops);
  // Immutable randomly named files stay outside the web public directory.
  const directory = options.directory ?? contentDirectory();
  const batch = randomUUID();
  const folder = join(directory, batch);
  await mkdir(folder, { recursive: true });
  const files = images.map((_, i) => `${batch}/${i}.webp`);
  try {
    await Promise.all(
      images.map((image, i) =>
        writeFile(join(directory, files[i]!), image, { flag: 'wx' }),
      ),
    );
    // Recheck approvals inside the publishing transaction, after the network work.
    return await store.db.$transaction(async (tx) => {
      const reviewed = await tx.asset.count({
        where: {
          id: { in: ids },
          titleId: manifest.titleId,
          ...approvalWhere(),
        },
      });
      if (reviewed !== ids.length)
        throw new Error('Проверка изображений изменилась во время подготовки.');
      const data = {
        stageFiles: files,
        sourceAssetIds: ids,
        ...(manifest.mode === 'spotlight' ? { crops: manifest.crops } : {}),
      };
      if (process.env.CONTENT_STORAGE === 'postgres') {
        for (let i = 0; i < files.length; i++) {
          await tx.contentFile.upsert({
            where: { key: files[i]! },
            create: { key: files[i]!, bytes: new Uint8Array(images[i]!) },
            update: {},
          });
        }
      }
      const puzzle = await tx.puzzle.upsert({
        where: {
          titleId_mode: { titleId: manifest.titleId, mode: manifest.mode },
        },
        create: { titleId: manifest.titleId, mode: manifest.mode, ...data },
        update: data,
      });
      return {
        puzzleId: puzzle.id,
        titleId: puzzle.titleId,
        mode: puzzle.mode,
        stages: 5,
      };
    });
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}
