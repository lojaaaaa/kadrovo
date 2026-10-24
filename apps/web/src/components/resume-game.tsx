'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/account';
import { sessionKey } from '@/lib/rooms';
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const read = () => {
  try {
    return localStorage.getItem('kadrovo:active-room') ?? '';
  } catch {
    return '';
  }
};
export function ResumeGame() {
  const code = useSyncExternalStore(subscribe, read, () => '');
  const room = useQuery({
    queryKey: ['resume-room', code],
    enabled: /^[A-F0-9]{8}$/.test(code),
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      let token: unknown;
      try {
        token = JSON.parse(
          localStorage.getItem(sessionKey(code)) ?? 'null',
        )?.token;
      } catch {
        return null;
      }
      if (typeof token !== 'string') return null;
      return api<{ available: boolean; phase?: string }>(
        'experience/resume',
        'POST',
        { code, token },
      );
    },
  });
  // Finished sessions stay in storage for results but are never advertised as an active game.
  if (!room.data?.available || room.data.phase === 'finished') return null;
  return (
    <Link
      href={'/room/' + code}
      className="mb-5 flex justify-between rounded-xl border bg-card p-4 text-sm"
    >
      <span>
        {room.data.phase === 'lobby'
          ? 'Вернуться в комнату'
          : 'Продолжить игру'}
      </span>
      <span className="text-primary">Вернуться →</span>
    </Link>
  );
}
