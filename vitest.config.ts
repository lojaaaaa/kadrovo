import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'apps/api/**/*.test.ts',
      'apps/web/src/lib/**/*.test.ts',
      'packages/**/*.test.ts',
    ],
    environment: 'node',
  },
});
