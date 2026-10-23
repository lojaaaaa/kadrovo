import { expect, it } from 'vitest';
import sharp from 'sharp';
import { prepareAvatar } from './avatar';
it('normalizes raster avatars to a square WebP and removes metadata', async () => {
  const original = await sharp({
    create: { width: 400, height: 200, channels: 3, background: '#744355' },
  })
    .withExif({ IFD0: { Artist: 'private metadata' } })
    .jpeg()
    .toBuffer();
  const result = await prepareAvatar(
    'data:image/jpeg;base64,' + original.toString('base64'),
  );
  const meta = await sharp(result).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.width).toBe(256);
  expect(meta.height).toBe(256);
  expect(meta.exif).toBeUndefined();
});
it('rejects SVG, corrupt files, oversized bodies and disguised SVG payloads', async () => {
  for (const image of [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png;base64,YmFk',
    'data:image/png;base64,' + 'A'.repeat(80001),
    'data:image/png;base64,' +
      Buffer.from('<svg width="10" height="10"></svg>').toString('base64'),
  ]) {
    await expect(prepareAvatar(image)).rejects.toThrow();
  }
});
