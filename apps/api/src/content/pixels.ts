import sharp from 'sharp';
export const pixelWidths = [24, 48, 96, 192, 960] as const;
export const pixelVersion = 'pixels-v2';
async function prepare(image: Buffer) {
  return sharp(image).rotate().png().toBuffer({ resolveWithObject: true });
}
async function render(
  source: Awaited<ReturnType<typeof prepare>>,
  width: number,
) {
  const small = await sharp(source.data)
    .resize({ width, withoutEnlargement: true })
    .png()
    .toBuffer();
  // Downsampling rounds small heights; restore the original aspect ratio for every hint.
  return sharp(small)
    .resize({
      width: 960,
      height: Math.max(
        1,
        Math.round((960 * source.info.height) / source.info.width),
      ),
      fit: 'fill',
      kernel: 'nearest',
    })
    .webp({ quality: 80 })
    .toBuffer();
}
export async function pixelStages(image: Buffer) {
  const source = await prepare(image);
  return Promise.all(
    pixelWidths.map(async (width) => {
      const frame = await render(source, width);
      return `data:image/webp;base64,${frame.toString('base64')}`;
    }),
  );
}
export async function pixelImage(image: Buffer, stage: number) {
  const width = pixelWidths[stage];
  if (width === undefined) throw new Error('Invalid pixel stage');
  return render(await prepare(image), width);
}
