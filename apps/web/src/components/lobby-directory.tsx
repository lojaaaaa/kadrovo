'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  modeLabels,
  categoryLabels,
  type RoomSession,
} from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { JoinRoomForm } from './join-room';
import { Button } from './ui/button';
import { Input } from './ui/input';
type Lobby = {
  code: string;
  host: string;
  players: number;
  capacity: number;
  mode: keyof typeof modeLabels;
  category: keyof typeof categoryLabels;
};
export function LobbyDirectory() {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const rooms = useQuery({
    queryKey: ['public-lobbies'],
    queryFn: () => api<Lobby[]>('rooms/public'),
    refetchInterval: 3000,
  });
  const join = useMutation({
    mutationFn: (code: string) =>
      api<RoomSession>('rooms/' + code + '/join', 'POST', {
        nickname:
          account.data?.account?.nickname ||
          'Гость ' + Math.random().toString(36).slice(2, 6),
      }),
    onSuccess: (s) => {
      saveSession(s);
      router.push('/room/' + s.code);
    },
  });
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Лобби</h1>
        <Link
          href="/play/party"
          className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
        >
          Создать лобби
        </Link>
      </div>
      <Input
        aria-label="Поиск лобби"
        placeholder="Имя ведущего или код"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="my-5 space-y-3">
        {rooms.data
          ?.filter((r) =>
            (r.host + ' ' + r.code)
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map((room) => (
            <article
              key={room.code}
              className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">Комната {room.host}</h2>
                <p className="text-sm text-muted-foreground">
                  {modeLabels[room.mode]} · {categoryLabels[room.category]}
                </p>
              </div>
              <span>
                {room.players}/{room.capacity}
              </span>
              <Button
                disabled={join.isPending || room.players >= room.capacity}
                onClick={() => join.mutate(room.code)}
              >
                Войти
              </Button>
            </article>
          ))}
        {rooms.isPending ? (
          <p>Загружаем лобби…</p>
        ) : rooms.data?.length === 0 ? (
          <p className="rounded-2xl border p-8 text-center text-muted-foreground">
            Открытых комнат пока нет. Создайте первую.
          </p>
        ) : null}
      </div>
      {(join.error || rooms.error) && (
        <p role="alert" className="text-destructive">
          {join.error?.message || rooms.error?.message}
        </p>
      )}
      <section className="mt-8 rounded-2xl border p-5">
        <JoinRoomForm />
      </section>
    </main>
  );
}
