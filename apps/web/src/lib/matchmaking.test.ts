import { expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { clearMatchmaking } from './matchmaking';
it('clears both queue sessions and prevents a late status response restoring a left room', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(['quick', 'a'], {
    status: 'matched',
    session: { code: 'OLD' },
  });
  client.setQueryData(['battle', 'a'], {
    status: 'matched',
    session: { code: 'RATED-OLD' },
  });
  let release!: (value: unknown) => void;
  const pending = client
    .fetchQuery({
      queryKey: ['quick', 'a'],
      queryFn: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    })
    .catch(() => null);
  await clearMatchmaking(client);
  release({ status: 'matched', session: { code: 'OLD' } });
  await pending;
  expect(client.getQueryData(['quick', 'a'])).toEqual({ status: 'idle' });
  expect(client.getQueryData(['battle', 'a'])).toEqual({ status: 'idle' });
  client.clear();
});
