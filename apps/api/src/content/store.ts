import { Injectable, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { normalizeTitle, type ImportedTitle } from './provider';
@Injectable()
export class CatalogStore implements OnModuleDestroy {
  readonly db: PrismaClient;
  constructor(
    @Optional()
    @Inject('CATALOG_CONNECTION')
    options?: {
      url: string;
      schema?: string;
    },
  ) {
    this.db = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionTimeoutMillis: 3000,
          max: 5,
          connectionString:
            options?.url ??
            process.env.DATABASE_URL ??
            'postgresql://filmless:filmless_local@localhost:5432/filmless',
        },
        options?.schema ? { schema: options.schema } : undefined,
      ),
    });
  }
  async onModuleDestroy() {
    await this.db.$disconnect();
  }
  async importTitle(input: ImportedTitle) {
    return this.db.$transaction(
      async (tx) => {
        const key = {
          provider: input.provider,
          mediaType: 'title',
          value: input.externalId,
        };
        const existing = await tx.externalId.findFirst({
          where: {
            value: input.externalId,
            mediaType: 'title',
            provider: { in: ['poiskkino', 'kinopoisk-unofficial'] },
          },
        });
        const data = {
          nameRu: input.nameRu,
          originalName: input.originalName,
          year: input.year,
          category: input.category,
          isSeries: input.isSeries,
        };
        const title = existing
          ? await tx.title.update({ where: { id: existing.titleId }, data })
          : await tx.title.create({
              data: { ...data, externalIds: { create: key } },
            });
        await tx.externalId.upsert({
          where: { provider_mediaType_value: key },
          create: { ...key, titleId: title.id },
          update: {},
        });
        for (const value of input.aliases) {
          const normalized = normalizeTitle(value);
          await tx.titleAlias.upsert({
            where: { titleId_normalized: { titleId: title.id, normalized } },
            create: { titleId: title.id, value, normalized },
            update: { value },
          });
        }
        for (const asset of input.assets)
          await tx.asset.upsert({
            where: {
              titleId_provider_sourceUrl: {
                titleId: title.id,
                provider: input.provider,
                sourceUrl: asset.sourceUrl,
              },
            },
            create: { titleId: title.id, provider: input.provider, ...asset },
            update: {
              width: asset.width,
              height: asset.height,
              retrievedAt: new Date(),
            },
          });
        return {
          titleId: title.id,
          name: title.nameRu,
          assets: input.assets.length,
          hasMoreImages: input.hasMoreImages,
        };
      },
      { timeout: 15000 },
    );
  }
}
