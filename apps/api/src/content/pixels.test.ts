import { it, expect } from 'vitest';
import sharp from 'sharp';
import { pixelStages, pixelImage } from './pixels';
it('renders distinct raster hints at consistent display size without exposing the original in early hints', async () => {
  const source = await sharp(
    Buffer.from(
      '<svg width="960" height="540"><rect width="960" height="540" fill="#234"/><circle cx="327" cy="231" r="117" fill="#fa7"/><rect x="600" y="50" width="190" height="350" fill="#59a"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const stages = await pixelStages(source);
  expect(stages).toHaveLength(5);
  expect(new Set(stages).size).toBe(5);
  for (const s of stages) {
    const m = await sharp(Buffer.from(s.split(',')[1]!, 'base64')).metadata();
    expect(m.width).toBe(960);
    expect(m.format).toBe('webp');
  }
});

it('keeps live catalog hints identical to the demo stages and rejects unknown stages', async () => {
  const source = await sharp({
    create: { width: 192, height: 108, channels: 3, background: '#285' },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="192" height="108"><circle cx="90" cy="50" r="32" fill="#c84"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const stages = await pixelStages(source);
  for (const stage of [0, 2, 4]) {
    const live = await pixelImage(source, stage);
    expect(
      live.equals(Buffer.from(stages[stage]!.split(',')[1]!, 'base64')),
    ).toBe(true);
    expect((await sharp(live).metadata()).height).toBe(540);
  }
  await expect(pixelImage(source, 5)).rejects.toThrow('Invalid pixel stage');
});
