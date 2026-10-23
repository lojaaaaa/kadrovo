import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
export function avatarUrl(account: {
  id: string;
  avatarVersion?: string | null;
}) {
  return account.avatarVersion
    ? `/api/auth/avatar/${account.id}?v=${account.avatarVersion}`
    : null;
}
export async function prepareAvatar(image: string) {
  if (
    image.length > 80000 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image)
  )
    throw new BadRequestException('Выберите изображение JPEG, PNG или WebP.');
  try {
    const input = sharp(Buffer.from(image.split(',')[1]!, 'base64'), {
      limitInputPixels: 16000000,
      animated: false,
    });
    const metadata = await input.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error('Unsupported format');
    return await input
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      'Не удалось прочитать изображение. Выберите другое.',
    );
  }
}
