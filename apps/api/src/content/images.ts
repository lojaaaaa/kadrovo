import sharp from 'sharp';
import { z } from 'zod';
import { limitedBody } from './provider';
export const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict();
export type Crop = z.infer<typeof cropSchema>;
export const publishSchema = z.discriminatedUnion('mode', [
  z
    .object({
      titleId: z.string().uuid(),
      mode: z.literal('frames'),
      assetIds: z.array(z.string().uuid()).length(5),
    })
    .strict(),
  z
    .object({
      titleId: z.string().uuid(),
      mode: z.literal('spotlight'),
      assetId: z.string().uuid(),
      crops: z.array(cropSchema).length(5),
    })
    .strict(),
]);
export function validateCrops(crops: Crop[]) {
  if (crops.length !== 5) throw new Error('Нужно пять областей раскрытия.');
  for (let i = 0; i < crops.length; i++) {
    const c = crops[i]!;
    cropSchema.parse(c);
    if (c.x + c.width > 1.000001 || c.y + c.height > 1.000001)
      throw new Error('Область выходит за пределы постера.');
    const previous = crops[i - 1];
    if (
      previous &&
      (c.x > previous.x ||
        c.y > previous.y ||
        c.x + c.width < previous.x + previous.width - 0.000001 ||
        c.y + c.height < previous.y + previous.height - 0.000001 ||
        c.width * c.height <= previous.width * previous.height)
    )
      throw new Error('Каждая следующая область должна расширять предыдущую.');
  }
}
const hosts = new Set([
  'avatars.mds.yandex.net',
  // Returned by PoiskKino and used by its official site for movie posters.
  'cdnrrviubnyuntopbez5.svc.cdn.yandex.net',
  'st.kp.yandex.net',
  'image.openmoviedb.com',
  'image.tmdb.org',
  'kinopoiskapiunofficial.tech',
  'images.kinopoiskapiunofficial.tech',
]);
export function allowedImageUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !hosts.has(u.hostname)
  )
    throw new Error('Хост изображения не входит в список поддерживаемых CDN.');
  return u.toString();
}
export async function downloadImage(
  url: string,
  request: typeof fetch = fetch,
) {
  let target = allowedImageUrl(url);
  const signal = AbortSignal.timeout(15000);
  let response: Response;
  for (let hop = 0; ; hop++) {
    response = await request(target, { redirect: 'manual', signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || hop >= 2)
      throw new Error('Слишком много перенаправлений изображения.');
    target = allowedImageUrl(new URL(location, target).href);
  }
  if (!response.ok)
    throw new Error(`Изображение недоступно: HTTP ${response.status}.`);
  const bytes = await limitedBody(response, 10_000_000);
  const raster =
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP') ||
    (bytes.toString('ascii', 4, 8) === 'ftyp' &&
      ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12)));
  if (!raster)
    throw new Error('Нужен растровый файл, SVG и HTML не допускаются.');
  const metadata = await sharp(bytes, {
    limitInputPixels: 40_000_000,
  }).metadata();
  if (
    !['jpeg', 'png', 'webp', 'avif'].includes(metadata.format ?? '') ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error('Нужен статичный растровый JPEG, PNG, WebP или AVIF.');
  return bytes;
}
export async function renderFrame(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1000,
      height: 650,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}
export async function renderCrops(bytes: Buffer, crops: Crop[]) {
  validateCrops(crops);
  const normalized = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = normalized.info;
  return Promise.all(
    crops.map((c) => {
      const left = Math.floor(c.x * width),
        top = Math.floor(c.y * height);
      const w = Math.max(
          1,
          Math.min(width - left, Math.floor(c.width * width)),
        ),
        h = Math.max(1, Math.min(height - top, Math.floor(c.height * height)));
      return sharp(normalized.data)
        .extract({ left, top, width: w, height: h })
        .resize({ width: 1000, height: 650, fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();
    }),
  );
}
