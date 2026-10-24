'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { RoomSession } from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
export function markQueue(value: boolean) {
  try {
    if (value) localStorage.setItem('kadrovo:queue', '1');
    else localStorage.removeItem('kadrovo:queue');
    window.dispatchEvent(new Event('kadrovo:queue'));
  } catch {
    /* Storage disabled. */
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener('kadrovo:queue', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('kadrovo:queue', cb);
    window.removeEventListener('storage', cb);
  };
};
const snapshot = () => {
  try {
    return localStorage.getItem('kadrovo:queue') === '1';
  } catch {
    return false;
  }
};
export function QueueResume() {
  const active = useSyncExternalStore(subscribe, snapshot, () => false),
    router = useRouter(),
    path = usePathname();
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const queue = useQuery({
    queryKey: ['quick', account.data?.account?.id],
    queryFn: () =>
      api<{ status: string; session?: RoomSession }>('battle/quick'),
    enabled: active && !!account.data?.account,
    refetchInterval: active ? 1500 : false,
  });
  const session = queue.data?.session;
  useEffect(() => {
    if (active && session && path !== '/room/' + session.code) {
      saveSession(session);
      markQueue(false);
      router.replace('/room/' + session.code);
    }
  }, [active, session, path, router, queue.data?.status]);
  return active && path !== '/online' ? (
    <div className="queue-banner" role="status">
      Ищем соперника в фоне. Найденная игра откроется автоматически.
    </div>
  ) : null;
}
