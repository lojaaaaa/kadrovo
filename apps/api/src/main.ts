import { json, urlencoded } from 'express';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { config } from 'dotenv';
import { z } from 'zod';
import { AppModule } from './app.module';
async function bootstrap() {
  config({ path: '../../.env', quiet: true });
  const env = z
    .object({
      API_HOST: z.string().default('127.0.0.1'),
      API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
      WEB_ORIGIN: z.url().default('http://localhost:3000'),
    })
    .parse(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet());
  app.use('/api/internal/catalog', json({ limit: '3mb', inflate: false }));
  app.use(json({ limit: '100kb', inflate: false }));
  app.use(urlencoded({ extended: true, limit: '100kb', inflate: false }));
  app.enableCors({ origin: env.WEB_ORIGIN });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, env.API_HOST);
}
void bootstrap();
