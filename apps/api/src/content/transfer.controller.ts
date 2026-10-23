import {
  Body,
  Controller,
  Headers,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CatalogStore } from './store';
import { allowedImageUrl } from './images';
const uuid = z.string().uuid();
const review = z.enum(['automated', 'unreviewed', 'approved', 'rejected']);
const fileKey = z.string().regex(/^[a-f0-9-]{36}\/[0-4]\.webp$/);
const titleSchema = z.object({
  id: uuid,
  nameRu: z.string().min(1).max(500),
  originalName: z.string().max(500).nullable(),
  year: z.number().int().nullable(),
  category: z.enum(['movies', 'series', 'animation']),
  isSeries: z.boolean(),
  aliases: z
    .array(
      z.object({
        id: uuid,
        value: z.string().max(500),
        normalized: z.string().max(500),
      }),
    )
    .max(100),
  externalIds: z
    .array(
      z.object({
        id: uuid,
        provider: z.string().max(80),
        mediaType: z.string().max(80),
        value: z.string().max(100),
      }),
    )
    .max(20),
  assets: z
    .array(
      z.object({
        id: uuid,
        provider: z.string().max(80),
        sourceUrl: z.string().max(2000),
        kind: z.enum(['poster', 'still', 'backdrop']),
        sourceType: z.string().nullable(),
        width: z.number().int().nullable(),
        height: z.number().int().nullable(),
        season: z.number().int().nullable(),
        episode: z.number().int().nullable(),
        rightsStatus: review,
        editorialStatus: review,
        permissionReference: z.string().nullable(),
      }),
    )
    .max(200),
  puzzles: z
    .array(
      z.object({
        id: uuid,
        mode: z.enum(['frames', 'spotlight']),
        stageFiles: z.array(fileKey).length(5),
        sourceAssetIds: z.array(uuid).min(1).max(5),
        crops: z.unknown().optional(),
      }),
    )
    .max(2),
});
@Controller('internal/catalog')
export class CatalogTransferController {
  constructor(@Inject(CatalogStore) private readonly store: CatalogStore) {}
  private authorize(header?: string) {
    const token = process.env.CATALOG_TRANSFER_TOKEN;
    if (
      !token ||
      token.length < 32 ||
      !header ||
      !timingSafeEqual(
        createHash('sha256').update(header).digest(),
        createHash('sha256')
          .update('Bearer ' + token)
          .digest(),
      )
    )
      throw new NotFoundException();
  }
  @Post('title') async title(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    this.authorize(authorization);
    const { aliases, externalIds, assets, puzzles, ...title } =
      titleSchema.parse(body);
    for (const asset of assets) allowedImageUrl(asset.sourceUrl);
    const assetIds = new Set(assets.map((a) => a.id));
    if (puzzles.some((p) => p.sourceAssetIds.some((id) => !assetIds.has(id))))
      throw new NotFoundException();
    await this.store.db.$transaction(
      async (tx) => {
        await tx.title.upsert({
          where: { id: title.id },
          create: title,
          update: title,
        });
        for (const row of aliases)
          await tx.titleAlias.upsert({
            where: { id: row.id },
            create: { ...row, titleId: title.id },
            update: row,
          });
        for (const row of externalIds)
          await tx.externalId.upsert({
            where: { id: row.id },
            create: { ...row, titleId: title.id },
            update: row,
          });
        for (const row of assets)
          await tx.asset.upsert({
            where: { id: row.id },
            create: { ...row, titleId: title.id },
            update: row,
          });
        for (const row of puzzles) {
          const { crops, ...p } = row;
          const data = {
            ...p,
            ...(crops ? { crops: JSON.parse(JSON.stringify(crops)) } : {}),
          };
          await tx.puzzle.upsert({
            where: { id: p.id },
            create: { ...data, titleId: title.id },
            update: data,
          });
        }
      },
      { timeout: 20000 },
    );
    return { ok: true };
  }
  @Post('file') async file(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    this.authorize(authorization);
    const input = z
      .object({ key: fileKey, base64: z.string().max(2700000) })
      .parse(body);
    const bytes = Buffer.from(input.base64, 'base64');
    if (
      bytes.length > 2000000 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP'
    )
      throw new NotFoundException();
    await this.store.db.contentFile.upsert({
      where: { key: input.key },
      create: { key: input.key, bytes },
      update: { bytes },
    });
    return { ok: true };
  }
}
