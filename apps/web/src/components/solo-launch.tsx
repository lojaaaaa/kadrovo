'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  modeLabels,
  type CreateRoom,
  type ContentAvailability,
  type RoomSession,
} from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
import { CreateRoomForm } from './create-room';
export function SoloLaunch({
  initialMode,
  initialCategory,
  initialCollection,
}: {
  initialMode: CreateRoom['mode'];
  initialCategory: CreateRoom['category'];
  initialCollection: NonNullable<CreateRoom['collection']>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const availability = useQuery({
    queryKey: ['content-availability'],
    queryFn: () => api<ContentAvailability>('content/availability'),
  });
  const play = useMutation({
    mutationFn: () =>
      api<RoomSession>('rooms', 'POST', {
        nickname: account.data?.account?.nickname || 'Киноман',
        format: 'solo',
        source:
          (availability.data?.categories.find(
            (c) => c.category === initialCategory,
          )?.[mode] ?? 0) >= 3
            ? 'catalog'
            : 'demo',
        category: initialCategory,
        collection: initialCollection,
        mode,
        totalRounds: 5,
        roundSeconds: 45,
      }),
    onSuccess: (s) => {
      saveSession(s);
      router.push('/room/' + s.code);
    },
  });
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border bg-card p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(modeLabels).map(([id, label]) => (
            <Button
              key={id}
              variant={mode === id ? 'default' : 'outline'}
              aria-pressed={mode === id}
              onClick={() => setMode(id as CreateRoom['mode'])}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          className="h-14 w-full text-lg"
          disabled={play.isPending || availability.isPending}
          onClick={() => play.mutate()}
        >
          {play.isPending ? 'Начинаем…' : 'Играть'}
        </Button>
        {play.error && (
          <p role="alert" className="mt-3 text-destructive">
            {play.error.message}
          </p>
        )}
      </section>
      <details className="rounded-2xl border p-4">
        <summary className="cursor-pointer font-medium">Настроить игру</summary>
        <div className="mt-5">
          <CreateRoomForm
            initialFormat="solo"
            initialMode={mode}
            initialCategory={initialCategory}
            initialCollection={initialCollection}
          />
        </div>
      </details>
    </div>
  );
}
