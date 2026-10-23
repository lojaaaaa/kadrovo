import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.pnpm-store/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/generated/**',
      '**/next-env.d.ts',
      '.husky/_/**',
      '.data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
  })),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  prettier,
];
