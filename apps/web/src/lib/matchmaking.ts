import type { QueryClient } from '@tanstack/react-query';
/** Cancel reads before clearing cached sessions, so late responses cannot resurrect a left room. */
export async function clearMatchmaking(client: QueryClient) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('kadrovo:queue');
      window.dispatchEvent(new Event('kadrovo:queue'));
    } catch {
      /* Storage can be unavailable. */
    }
  }
  await Promise.all([
    client.cancelQueries({ queryKey: ['quick'] }),
    client.cancelQueries({ queryKey: ['battle'] }),
  ]);
  client.setQueriesData({ queryKey: ['quick'] }, { status: 'idle' });
  client.setQueriesData({ queryKey: ['battle'] }, { status: 'idle' });
}
