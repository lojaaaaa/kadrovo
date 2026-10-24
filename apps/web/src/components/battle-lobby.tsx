'use client';
import { markQueue } from './queue-resume';
import { Trophy, ArrowRight, LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoomSession, ContentAvailability } from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
import { SectionSkeleton } from './section-skeleton';
import { Card } from './ui/card';
type Queue = { status: 'idle' | 'waiting' | 'matched'; session?: RoomSession };
export function BattleLobby() {
  const router = useRouter(),
    client = useQueryClient();
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const availability = useQuery({
    queryKey: ['content-availability'],
    queryFn: () => api<ContentAvailability>('content/availability'),
    refetchInterval: 30000,
  });
  const filmCount = availability.data?.categories.find(
    (c) => c.category === 'movies',
  )?.frames;
  const queue = useQuery({
    queryKey: ['battle', account.data?.account?.id],
    queryFn: () => api<Queue>('battle'),
    staleTime: 0,
    enabled: !!account.data?.account,
    refetchInterval: 2000,
    retry: false,
  });
  const action = useMutation({
    mutationFn: (method: string) => api<Queue>('battle', method),
    onSuccess: (value, method) => {
      if (method === 'POST') {
        markQueue(false);
        client.setQueriesData({ queryKey: ['quick'] }, { status: 'idle' });
      }
      client.setQueryData(['battle', account.data?.account?.id], value);
      void client.invalidateQueries({ queryKey: ['battle'] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['battle'] });
    },
  });
  const session = queue.data?.session;
  useEffect(() => {
    if (session && queue.isFetchedAfterMount && !queue.isFetching) {
      saveSession(session);
      router.replace(`/room/${session.code}`);
    }
  }, [session, router, queue.isFetchedAfterMount, queue.isFetching]);
  const waiting = queue.data?.status === 'waiting';
  if (
    account.isPending ||
    availability.isPending ||
    (account.data?.account &&
      (queue.isPending || (queue.isFetching && !queue.isFetchedAfterMount)))
  )
    return (
      <main className="screen screen--battle-lobby px-5 py-8">
        <SectionSkeleton kind="form" />
      </main>
    );
  return (
    <main className="screen screen--battle-lobby mx-auto max-w-xl px-5 py-12">
      <Card className="space-y-5 p-8">
        <p className="text-sm uppercase tracking-widest text-primary">
          1 на 1 · Elo
        </p>
        <h1 className="text-4xl font-bold">Рейтинговая дуэль</h1>
        <p className="text-muted-foreground">
          Случайный соперник и пять общих фильмов. Кадры и таймер у каждого
          свои. На старте — 45 секунд и 20 возможных очков. Новая подсказка: −5
          секунд и −4 очков.
        </p>
        {filmCount !== undefined && (
          <p className="rounded-xl border bg-primary/5 p-4 text-sm">
            В подборке {filmCount} фильмов. На каждую дуэль выбираем 5
            случайных, без повторов внутри партии.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Результат влияет на рейтинг. Оставьте эту страницу открытой, пока ищем
          соперника.
        </p>
        {account.isPending ? (
          <p>Проверяем вход…</p>
        ) : !account.data?.account ? (
          <Link
            href="/account?reason=ranked"
            className="font-semibold text-primary"
          >
            Войти и найти соперника →
          </Link>
        ) : (
          <>
            <p>
              Играете как <strong>{account.data.account.nickname}</strong>
            </p>
            <p role="status" className="flex items-center gap-2">
              {waiting && (
                <LoaderCircle
                  aria-hidden
                  className="size-4 animate-spin text-primary"
                />
              )}
              {queue.data?.status === 'matched'
                ? 'Соперник найден. Открываем дуэль…'
                : waiting
                  ? 'Ищем соперника…'
                  : 'Поиск ещё не начат.'}
            </p>
            <Button
              disabled={
                action.isPending ||
                queue.isPending ||
                queue.data?.status === 'matched'
              }
              variant={waiting ? 'outline' : 'default'}
              onClick={() => action.mutate(waiting ? 'DELETE' : 'POST')}
            >
              {waiting ? 'Отменить поиск' : 'Найти соперника'}
            </Button>
          </>
        )}
        {(account.error || action.error || queue.error) && (
          <p role="alert" className="text-destructive">
            {account.error?.message ||
              action.error?.message ||
              queue.error?.message}
          </p>
        )}
      </Card>
      <Link href="/ratings" className="rankings-link mt-4">
        <Trophy aria-hidden className="size-5 text-primary" />
        <span>
          Общий рейтинг<small>Лучшие игроки и ваше место</small>
        </span>
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </main>
  );
}
