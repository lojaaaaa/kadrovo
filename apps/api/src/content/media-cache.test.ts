import { expect, it, vi } from 'vitest';
import { MediaCache } from './media-cache';
it('coalesces concurrent reads and retains recently used entries within a byte budget', async () => {
  const cache = new MediaCache(6);
  const load = vi.fn(async () => Buffer.from('abc'));
  await Promise.all([cache.get('a', load), cache.get('a', load)]);
  expect(load).toHaveBeenCalledTimes(1);
  await cache.get('b', load);
  await cache.get('a', load);
  await cache.get('c', load);
  await cache.get('a', load);
  expect(load).toHaveBeenCalledTimes(3);
  await cache.get('b', load);
  expect(load).toHaveBeenCalledTimes(4);
});
it('retries failed reads, evicts removed keys and does not cache oversized files', async () => {
  const cache = new MediaCache(2);
  const load = vi.fn(async () => Buffer.from('a'));
  await expect(
    cache.get('x', async () => {
      throw Error('lost');
    }),
  ).rejects.toThrow('lost');
  await cache.get('x', load);
  cache.retain(new Set());
  await cache.get('x', load);
  expect(load).toHaveBeenCalledTimes(2);
  const large = vi.fn(async () => Buffer.from('large'));
  await cache.get('big', large);
  await cache.get('big', large);
  expect(large).toHaveBeenCalledTimes(2);
});
