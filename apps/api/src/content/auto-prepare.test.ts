import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { imageFingerprint, similarFingerprint } from './auto-prepare';
describe('automatic frame deduplication', () => {
  it('recognizes the same scene after resizing and re-encoding', async () => {
    const data = Buffer.from(
      Array.from({ length: 80 * 80 * 3 }, (_, i) =>
        Math.round(
          128 +
            70 * Math.sin((Math.floor(i / 3) % 80) / 13) +
            40 * Math.cos(Math.floor(i / 240) / 19),
        ),
      ),
    );
    const original = await sharp(data, {
      raw: { width: 80, height: 80, channels: 3 },
    })
      .png()
      .toBuffer();
    const copy = await sharp(original)
      .resize(800, 800)
      .jpeg({ quality: 80 })
      .toBuffer();
    expect(
      similarFingerprint(
        await imageFingerprint(original),
        await imageFingerprint(copy),
      ),
    ).toBe(true);
    const alpha = await sharp(original).ensureAlpha().png().toBuffer();
    expect(await imageFingerprint(alpha)).toEqual(
      await imageFingerprint(original),
    );
    expect(
      similarFingerprint(Array(64).fill(true), Array(64).fill(false)),
    ).toBe(false);
  });
});
