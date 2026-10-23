import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {
  mapPoiskKino,
  PoiskKinoClient,
  normalizeTitle,
  limitedBody,
} from './provider';
import {
  allowedImageUrl,
  downloadImage,
  renderCrops,
  validateCrops,
} from './images';
const movie = {
  id: 123,
  name: 'Тест',
  type: 'animated-series',
  year: 2020,
  enName: '',
  names: [{ name: 'Тёст' }],
  poster: { url: 'https://image.tmdb.org/poster.jpg' },
};
const page = {
  docs: [
    { url: 'https://image.tmdb.org/still.jpg', type: 'still' },
    { url: 'https://image.tmdb.org/promo.jpg', type: 'promo' },
  ],
  hasNext: true,
  next: 'cursor 1',
};
const crops = [0.1, 0.2, 0.4, 0.7, 1].map((size) => ({
  x: (1 - size) / 2,
  y: (1 - size) / 2,
  width: size,
  height: size,
}));
describe('provider boundary', () => {
  it('accepts the verified poster CDN without allowing arbitrary Yandex subdomains', () => {
    expect(
      allowedImageUrl(
        'https://cdnrrviubnyuntopbez5.svc.cdn.yandex.net/poster.jpg',
      ),
    ).toContain('/poster.jpg');
    expect(() =>
      allowedImageUrl('https://unverified.svc.cdn.yandex.net/poster.jpg'),
    ).toThrow();
    expect(() =>
      allowedImageUrl(
        'https://cdnrrviubnyuntopbez5.svc.cdn.yandex.net.evil.example/poster.jpg',
      ),
    ).toThrow();
  });
  it('keeps animation separate, normalizes aliases and excludes promotional shots', () => {
    const m = mapPoiskKino(movie, [page]);
    expect(m.category).toBe('animation');
    expect(m.isSeries).toBe(true);
    expect(m.assets.map((a) => a.kind)).toEqual(['poster', 'still']);
    expect(m.hasMoreImages).toBe(true);
    expect(normalizeTitle('Ёжик — В ТУМАНЕ!')).toBe('ежиквтумане');
  });
  it('uses bounded cursor pagination and never puts the key in the URL', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(movie))
      .mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(Response.json({ docs: [], hasNext: false }));
    const data = await new PoiskKinoClient('secret', request).load('123', 2);
    expect(data.hasMoreImages).toBe(false);
    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[2]![0])).toContain('next=cursor+1');
    for (const call of request.mock.calls.slice(1)) {
      expect(new URL(String(call[0])).searchParams.getAll('type')).toEqual([
        'frame',
        'still',
        'screenshot',
      ]);
    }
    expect(String(request.mock.calls[0]![0])).not.toContain('secret');
    expect(request.mock.calls[0]![1]?.redirect).toBe('error');
  });
  it('fails without a key before calling the provider and sanitizes provider failures', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(new PoiskKinoClient('', request).load('123')).rejects.toThrow(
      'POISKKINO_API_KEY',
    );
    expect(request).not.toHaveBeenCalled();
    request.mockRejectedValue(new Error('secret network exception'));
    await expect(
      new PoiskKinoClient('secret', request).load('123'),
    ).rejects.not.toThrow('secret');
  });
  it('bounds response bytes and refuses private or lookalike hosts', async () => {
    await expect(limitedBody(new Response('123456'), 5)).rejects.toThrow();
    for (const url of [
      'http://image.tmdb.org/x',
      'https://127.0.0.1/x',
      'https://image.tmdb.org.evil.test/x',
      'https://user@image.tmdb.org/x',
      'https://image.tmdb.org:444/x',
    ])
      expect(() => allowedImageUrl(url)).toThrow();
    await expect(
      downloadImage(
        'https://image.tmdb.org/x',
        vi.fn<typeof fetch>().mockResolvedValue(new Response('<svg></svg>')),
      ),
    ).rejects.toThrow('растровый');
  });
  it('follows poster redirects only to supported image hosts', async () => {
    const bytes = await sharp({
      create: { width: 20, height: 30, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'https://st.kp.yandex.net/poster.jpg' },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(bytes)));
    expect(
      await downloadImage(
        'https://kinopoiskapiunofficial.tech/poster.jpg',
        request,
      ),
    ).toEqual(bytes);
    expect(request).toHaveBeenCalledTimes(2);
    const denied = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
    );
    await expect(
      downloadImage('https://image.tmdb.org/x', denied),
    ).rejects.toThrow('Хост');
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it('requires strictly expanding nested crops and renders only the visible pixels', async () => {
    expect(() => validateCrops(crops)).not.toThrow();
    expect(() => validateCrops([...crops.slice(0, 4), crops[3]!])).toThrow();
    expect(() =>
      validateCrops([
        { x: 0.9, y: 0, width: 0.2, height: 0.2 },
        ...crops.slice(1),
      ]),
    ).toThrow();
    const bytes = await sharp({
      create: { width: 200, height: 300, channels: 3, background: '#ff0000' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 60,
              height: 90,
              channels: 3,
              background: '#0000ff',
            },
          })
            .png()
            .toBuffer(),
          left: 70,
          top: 105,
        },
      ])
      .png()
      .toBuffer();
    const rendered = await renderCrops(bytes, crops);
    expect(rendered).toHaveLength(5);
    const first = await sharp(rendered[0]).raw().toBuffer();
    expect(first[2]).toBeGreaterThan(230);
    expect(first[0]).toBeLessThan(20);
    const last = await sharp(rendered[4]).raw().toBuffer();
    expect(last[0]).toBeGreaterThan(230);
  });
});
