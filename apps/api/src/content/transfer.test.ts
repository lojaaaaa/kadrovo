import { afterEach, expect, it, vi } from 'vitest';
import { CatalogTransferController } from './transfer.controller';
import type { CatalogStore } from './store';
afterEach(() => vi.unstubAllEnvs());
it('keeps the transfer channel closed by default and rejects invalid credentials before writes', async () => {
  const upsert = vi.fn();
  const controller = new CatalogTransferController({
    db: { contentFile: { upsert } },
  } as unknown as CatalogStore);
  vi.stubEnv('CATALOG_TRANSFER_TOKEN', '');
  await expect(controller.file(undefined, {})).rejects.toThrow();
  vi.stubEnv('CATALOG_TRANSFER_TOKEN', 'a'.repeat(48));
  await expect(controller.file('Bearer wrong', {})).rejects.toThrow();
  expect(upsert).not.toHaveBeenCalled();
});
it('rejects path traversal and non-WebP payloads even for an authorized transfer', async () => {
  const upsert = vi.fn();
  const controller = new CatalogTransferController({
    db: { contentFile: { upsert } },
  } as unknown as CatalogStore);
  vi.stubEnv('CATALOG_TRANSFER_TOKEN', 'a'.repeat(48));
  const auth = 'Bearer ' + 'a'.repeat(48);
  await expect(
    controller.file(auth, { key: '../test', base64: 'aGVsbG8=' }),
  ).rejects.toThrow();
  await expect(
    controller.file(auth, {
      key: '11111111-1111-4111-8111-111111111111/0.webp',
      base64: 'aGVsbG8=',
    }),
  ).rejects.toThrow();
  expect(upsert).not.toHaveBeenCalled();
});
