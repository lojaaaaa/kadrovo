import sharp from 'sharp';
export async function pixelStages(image: Buffer) {
  return Promise.all(
    [12, 24, 48, 96, 960].map(async (width) => {
      const small = await sharp(image)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .png()
        .toBuffer();
      const frame = await sharp(small)
        .resize({ width: 960, kernel: 'nearest' })
        .webp({ quality: 80 })
        .toBuffer();
      return `data:image/webp;base64,${frame.toString('base64')}`;
    }),
  );
}

export async function pixelImage(image: Buffer, stage: number) {
  const width = [12, 24, 48, 96, 960][stage];
  if (width === undefined) throw new Error('Invalid pixel stage');
  const small = await sharp(image)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .png()
    .toBuffer();
  return sharp(small)
    .resize({ width: 960, kernel: 'nearest' })
    .webp({ quality: 80 })
    .toBuffer();
}
