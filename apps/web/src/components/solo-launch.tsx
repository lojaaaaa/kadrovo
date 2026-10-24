'use client';
import { SectionSkeleton } from './section-skeleton';
import {
  Film,
  ScanSearch,
  Grid2X2,
  Shuffle,
  TextCursorInput,
  ListChecks,
  Play,
} from 'lucide-react';
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
  const [answerMode, setAnswerMode] = useState<'search' | 'choices'>('search');
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
        answerMode,
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
  if (availability.isPending) return <SectionSkeleton kind="form" />;
  return (
    <div className="solo-launch space-y-4">
      <section className="rounded-2xl border surface-panel bg-card p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(modeLabels).map(([id, label]) => {
            const Icon = {
              frames: Film,
              spotlight: ScanSearch,
              pixels: Grid2X2,
              mix: Shuffle,
            }[id as CreateRoom['mode']];
            const description = {
              frames: 'Узнать по сценам',
              spotlight: 'Открывать постер',
              pixels: 'Прояснять изображение',
              mix: 'Чередовать подсказки',
            }[id as CreateRoom['mode']];
            return (
              <Button
                key={id}
                className="solo-mode-option"
                variant={mode === id ? 'default' : 'outline'}
                aria-pressed={mode === id}
                onClick={() => setMode(id as CreateRoom['mode'])}
              >
                <Icon size={23} aria-hidden="true" />
                <span className="solo-mode-name">{label}</span>
                <span className="solo-mode-description">{description}</span>
              </Button>
            );
          })}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(['search', 'choices'] as const).map((value) => (
            <Button
              key={value}
              aria-pressed={answerMode === value}
              variant={answerMode === value ? 'default' : 'outline'}
              onClick={() => setAnswerMode(value)}
            >
              {value === 'search' ? (
                <TextCursorInput aria-hidden="true" />
              ) : (
                <ListChecks aria-hidden="true" />
              )}
              {value === 'search' ? 'Ввод названия' : 'Выбор из 4'}
            </Button>
          ))}
        </div>
        <Button
          className="h-12 w-full text-base"
          disabled={play.isPending || availability.isPending}
          onClick={() => play.mutate()}
        >
          <Play aria-hidden="true" />
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
