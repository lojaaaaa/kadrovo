import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
config({ path: '../../.env', quiet: true });
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://filmless:filmless_local@localhost:5432/filmless',
  },
});
