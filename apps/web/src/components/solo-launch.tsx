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
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  collectionDefinitions,
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
  const [selectedCollection, setSelectedCollection] =
    useState(initialCollection);
  const [weekly] = useState(
    () => collectionDefinitions[1 + (Math.floor(Date.now() / 604800000) % 5)]!,
  );

  const [answerMode, setAnswerMode] = useState<'search' | 'choices'>('search');
  const [mode, setMode] = useState(initialMode);
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const availability = useQuery({
    queryKey: ['content-availability'],
    refetchInterval: (query) => (query.state.data?.ready ? 30000 : 2000),
    queryFn: () => api<ContentAvailability>('content/availability'),
  });
  const availableCount =
    availability.data?.collections
      ?.find((c) => c.id === selectedCollection)
      ?.categories.find((c) => c.category === initialCategory)?.[mode] ??
    (selectedCollection === 'all'
      ? (availability.data?.categories.find(
          (c) => c.category === initialCategory,
        )?.[mode] ?? 0)
      : 0);
  const queueAtLaunch = useRef(false);
  const play = useMutation({
    mutationFn: () => {
      queueAtLaunch.current = localStorage.getItem('kadrovo:queue') === '1';
      return api<RoomSession>('rooms', 'POST', {
        nickname: account.data?.account?.nickname || 'Киноман',
        format: 'solo',
        answerMode,
        source: 'catalog',
        category: initialCategory,
        collection: selectedCollection,
        mode,
        totalRounds: 5,
        roundSeconds: 45,
      });
    },
    onSuccess: async (s) => {
      if (queueAtLaunch.current) {
        const queue = await api<{ status: string; session?: RoomSession }>(
          'battle/quick',
        ).catch(() => null);
        if (queue?.session) {
          saveSession(queue.session);
          router.replace('/room/' + queue.session.code);
          return;
        }
      }
      if (window.location.pathname !== '/play/solo') return;
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
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Подборка недели:</span>
          <button
            className="taste-chip"
            type="button"
            aria-pressed={selectedCollection === weekly.id}
            onClick={() =>
              setSelectedCollection(
                selectedCollection === weekly.id ? 'all' : weekly.id,
              )
            }
          >
            {weekly.name}
          </button>
        </div>
        <Button
          className="h-12 w-full text-base"
          disabled={
            play.isPending || availability.isPending || availableCount < 3
          }
          onClick={() => play.mutate()}
        >
          <Play aria-hidden="true" />
          {play.isPending ? 'Начинаем…' : 'Играть'}
        </Button>
        {availableCount < 3 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Для выбранного режима пока недостаточно фильмов. Выберите другую
            подборку.
          </p>
        )}
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
