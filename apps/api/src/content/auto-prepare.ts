import sharp from 'sharp';
import { downloadImage } from './images';
import { localContentPreview } from './approval';
import { CatalogStore } from './store';
import type { ImportedTitle } from './provider';
import type { Crop } from './images';
import { publishPuzzle } from './publish';

// Difference hash compares shapes after normalizing resolution and encoding.
export async function imageFingerprint(bytes: Buffer) {
  const pixels = await sharp(bytes)
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer();
  return Array.from(
    { length: 64 },
    (_, i) =>
      pixels[Math.floor(i / 8) * 9 + (i % 8)]! >
      pixels[Math.floor(i / 8) * 9 + (i % 8) + 1]!,
  );
}
export function similarFingerprint(a: boolean[], b: boolean[]) {
  return a.reduce((n, bit, i) => n + Number(bit !== b[i]), 0) <= 8;
}
export async function prepareAutomaticFrames(
  store: CatalogStore,
  titleId: string,
) {
  const existing = await store.db.puzzle.findUnique({
    where: { titleId_mode: { titleId, mode: 'frames' } },
  });
  if (existing) return 'already-published';
  const assets = await store.db.asset.findMany({
    where: {
      titleId,
      kind: 'still',
      editorialStatus: { not: 'rejected' },
      ...(localContentPreview()
        ? {
            rightsStatus: {
              in: ['approved', 'unreviewed'] as ('approved' | 'unreviewed')[],
            },
          }
        : {
            rightsStatus: 'approved' as const,
            permissionReference: { not: null },
          }),
    },
    take: 50,
    orderBy: { id: 'asc' },
  });
  const chosen: string[] = [],
    hashes: boolean[][] = [];
  const cache = new Map<string, Buffer>();
  for (const asset of assets) {
    try {
      const bytes = await downloadImage(asset.sourceUrl);
      const metadata = await sharp(bytes).rotate().metadata();
      const width = metadata.width ?? 0,
        height = metadata.height ?? 0;
      if (
        width < 480 ||
        height < 240 ||
        width / height < 1.2 ||
        width / height > 2.6
      )
        continue;
      const hash = await imageFingerprint(bytes);
      if (hashes.some((h) => similarFingerprint(h, hash))) continue;
      hashes.push(hash);
      chosen.push(asset.id);
      cache.set(asset.sourceUrl, bytes);
      if (chosen.length === 5) break;
    } catch {
      /* Broken or unsupported images are excluded from the candidate pool. */
    }
  }
  if (chosen.length < 5) return 'not-enough-images';
  // Machine checks are recorded separately from human editorial approval.
  await store.db.asset.updateMany({
    where: { id: { in: chosen }, editorialStatus: 'unreviewed' },
    data: { editorialStatus: 'automated' },
  });
  const request: typeof fetch = async (input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const bytes = cache.get(url);
    if (!bytes) throw new Error('Image is not in the prepared batch');
    return new Response(new Uint8Array(bytes));
  };
  await publishPuzzle(
    store,
    { titleId, mode: 'frames', assetIds: chosen },
    { request },
  );
  return 'published';
}
export function automaticCrops(): Crop[] {
  return [0.18, 0.32, 0.5, 0.72, 1].map((size) => ({
    x: (1 - size) / 2,
    y: (1 - size) / 2,
    width: size,
    height: size,
  }));
}
export async function prepareAutomaticPoster(
  store: CatalogStore,
  titleId: string,
) {
  if (
    await store.db.puzzle.findUnique({
      where: { titleId_mode: { titleId, mode: 'spotlight' } },
    })
  )
    return 'already-published';
  const posters = await store.db.asset.findMany({
    where: {
      titleId,
      kind: 'poster',
      editorialStatus: { not: 'rejected' },
      ...(localContentPreview()
        ? {
            rightsStatus: {
              in: ['approved', 'unreviewed'] as ('approved' | 'unreviewed')[],
            },
          }
        : {
            rightsStatus: 'approved' as const,
            permissionReference: { not: null },
          }),
    },
    take: 3,
  });
  for (const poster of posters) {
    try {
      const bytes = await downloadImage(poster.sourceUrl);
      const meta = await sharp(bytes).metadata();
      if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 300) continue;
      await store.db.asset.updateMany({
        where: { id: poster.id, editorialStatus: 'unreviewed' },
        data: { editorialStatus: 'automated' },
      });
      await publishPuzzle(
        store,
        {
          titleId,
          mode: 'spotlight',
          assetId: poster.id,
          crops: automaticCrops(),
        },
        { request: async () => new Response(new Uint8Array(bytes)) },
      );
      return 'published';
    } catch {
      /* Try another poster when an image is unavailable. */
    }
  }
  return 'not-enough-images';
}
export async function backfillPosters(
  store: CatalogStore,
  report: (line: string) => void = console.log,
) {
  const titles = await store.db.title.findMany({
    where: {
      puzzles: { none: { mode: 'spotlight' } },
      assets: { some: { kind: 'poster' } },
    },
    select: { id: true },
    take: 300,
  });
  let published = 0;
  for (const title of titles)
    if ((await prepareAutomaticPoster(store, title.id)) === 'published')
      published++;
  report(
    JSON.stringify({ automaticPosters: published, checked: titles.length }),
  );
  return published;
}
export interface AutomaticProvider {
  readonly provider: ImportedTitle['provider'];
  discoverPage(
    count: number,
    type?: string,
    next?: string,
  ): Promise<{ ids: string[]; next?: string }>;
  load(id: string): Promise<ImportedTitle>;
  cachedTitle?(id: string): ImportedTitle | undefined;
}
export async function syncAutomaticCatalog(
  store: CatalogStore,
  client: AutomaticProvider,
  count: number,
  report: (line: string) => void = console.log,
  options: { type?: string; next?: string; frameBudget?: number } = {},
) {
  const page = await client.discoverPage(count, options.type, options.next);
  const ids = page.ids;
  const totals = {
    checked: ids.length,
    published: 0,
    existing: 0,
    unavailable: 0,
    posters: 0,
    deferredFrames: 0,
  };
  // Save all list metadata before spending quota on per-title image requests.
  for (const id of ids) {
    const metadata = client.cachedTitle?.(id);
    if (!metadata) continue;
    const imported = await store.importTitle(metadata);
    if ((await prepareAutomaticPoster(store, imported.titleId)) === 'published')
      totals.posters++;
  }
  let attempted = 0;
  const pending =
    options.frameBudget === undefined
      ? []
      : await store.db.externalId.findMany({
          where: {
            provider: client.provider,
            mediaType: 'title',
            title: { puzzles: { none: { mode: 'frames' } } },
          },
          orderBy: { title: { updatedAt: 'asc' } },
          take: options.frameBudget,
        });
  const workIds = [...new Set([...pending.map((p) => p.value), ...ids])];
  for (const id of workIds) {
    const existing = await store.db.externalId.findFirst({
      where: {
        value: id,
        mediaType: 'title',
        provider: { in: ['poiskkino', 'kinopoisk-unofficial'] },
      },
      include: {
        title: {
          include: {
            puzzles: true,
            assets: { where: { kind: 'still' }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (
      existing?.title.puzzles.some((p) => p.mode === 'frames') &&
      existing.title.puzzles.some((p) => p.mode === 'spotlight')
    ) {
      totals.existing++;
      continue;
    }
    const needsImages =
      !existing ||
      (!existing.title.puzzles.some((p) => p.mode === 'frames') &&
        !existing.title.assets.length);
    if (attempted >= (options.frameBudget ?? count)) {
      totals.deferredFrames++;
      continue;
    }
    attempted++;
    const imported = needsImages
      ? await store.importTitle(await client.load(id))
      : { titleId: existing!.titleId, name: existing!.title.nameRu };
    await prepareAutomaticPoster(store, imported.titleId);
    const status = await prepareAutomaticFrames(store, imported.titleId);
    await store.db.title.update({
      where: { id: imported.titleId },
      data: { updatedAt: new Date() },
    });
    if (status === 'published') totals.published++;
    else if (status === 'already-published') totals.existing++;
    else totals.unavailable++;
    report(JSON.stringify({ name: imported.name, status }));
  }
  return { ...totals, next: page.next };
}
