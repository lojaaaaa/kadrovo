'use client';
import { AnswerChoice } from './answer-choice';
import type { ExperienceSummary } from './experience-panel';
import { ArrowLeftRight } from 'lucide-react';
import { SectionSkeleton } from './section-skeleton';
import { Film, ScanSearch, Grid2X2, Shuffle, Play } from 'lucide-react';
import { useRef, useState } from 'react';
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
  const [advanced, setAdvanced] = useState(false);
  const [chronology, setChronology] = useState(false);
  const selectedCollection = initialCollection;
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
  const progress = useQuery({
    queryKey: ['experience'],
    queryFn: () => api<ExperienceSummary>('experience'),
    staleTime: 5000,
  });
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
  if (
    availability.isPending ||
    account.isPending ||
    progress.isPending ||
    (progress.isFetching && !progress.isFetchedAfterMount)
  )
    return <SectionSkeleton kind="form" />;
  return (
    <div className="solo-launch solo-launch-v2 space-y-4">
      <section
        hidden={advanced}
        className="rounded-2xl border surface-panel bg-card p-6"
      >
        <div className="solo-game-grid">
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
                variant={!chronology && mode === id ? 'default' : 'outline'}
                aria-pressed={!chronology && mode === id}
                onClick={() => {
                  setChronology(false);
                  setMode(id as CreateRoom['mode']);
                }}
              >
                <Icon size={23} aria-hidden="true" />
                <span className="solo-mode-name">{label}</span>
                <span className="solo-mode-description">{description}</span>
              </Button>
            );
          })}
          <Button
            className="solo-mode-option"
            variant={chronology ? 'default' : 'outline'}
            aria-pressed={chronology}
            onClick={() => setChronology(true)}
          >
            <ArrowLeftRight size={23} aria-hidden="true" />
            <span className="solo-mode-name">Раньше или позже</span>
            <span className="solo-mode-description">
              Сравнивать годы выхода
            </span>
          </Button>
        </div>
        <div className="solo-launch-toolbar">
          {!chronology && (
            <AnswerChoice value={answerMode} onChange={setAnswerMode} />
          )}
          {progress.data?.access?.guest && (
            <span className="guest-remaining">
              Без входа: осталось {progress.data.access.soloRemaining} игр
            </span>
          )}
          <Button
            className="solo-play-button h-11 text-base"
            disabled={
              play.isPending ||
              availability.isPending ||
              (!chronology && availableCount < 3)
            }
            onClick={() =>
              chronology ? router.push('/play/chronology') : play.mutate()
            }
          >
            <Play aria-hidden="true" />
            {play.isPending ? 'Начинаем…' : 'Играть'}
          </Button>
        </div>
        {!chronology && availableCount < 3 && (
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
      <details
        hidden={chronology}
        className="rounded-2xl border p-4"
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary className="cursor-pointer font-medium">Настроить игру</summary>
        <div className="mt-5">
          <CreateRoomForm
            key={`${mode}:${answerMode}:${selectedCollection}`}
            initialFormat="solo"
            initialAnswerMode={answerMode}
            initialMode={mode}
            initialCategory={initialCategory}
            initialCollection={selectedCollection}
          />
        </div>
      </details>
    </div>
  );
}
