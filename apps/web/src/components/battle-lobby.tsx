'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoomSession, ContentAvailability } from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
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
    enabled: !!account.data?.account,
    refetchInterval: 2000,
    retry: false,
  });
  const action = useMutation({
    mutationFn: (method: string) => api<Queue>('battle', method),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['battle'] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['battle'] });
    },
  });
  const session = queue.data?.session;
  useEffect(() => {
    if (session) {
      saveSession(session);
      router.replace(`/room/${session.code}`);
    }
  }, [session, router]);
  const waiting = queue.data?.status === 'waiting';
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <Card className="space-y-5 p-8">
        <p className="text-sm uppercase tracking-widest text-primary">
          Батл · 1 на 1
        </p>
        <h1 className="text-4xl font-bold">Кто вспомнит первым?</h1>
        <p className="text-muted-foreground">
          Случайный соперник и три общих фильма. Кадры и таймер у каждого свои.
          На старте — 45 секунд и 20 возможных очков. Новая подсказка: −5 секунд
          и −4 очков.
        </p>
        {filmCount !== undefined && (
          <p className="rounded-xl border bg-primary/5 p-4 text-sm">
            В подборке {filmCount} фильмов. На каждую дуэль выбираем 3
            случайных, без повторов внутри партии.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Первые дуэли проходят без рейтинга. Оставьте эту страницу открытой,
          пока ищем соперника.
        </p>
        {account.isPending ? (
          <p>Проверяем вход…</p>
        ) : !account.data?.account ? (
          <Link href="/account" className="font-semibold text-primary">
            Войти и найти соперника →
          </Link>
        ) : (
          <>
            <p>
              Играете как <strong>{account.data.account.nickname}</strong>
            </p>
            <p role="status">
              {queue.data?.status === 'matched'
                ? 'Соперник найден! Открываем дуэль…'
                : waiting
                  ? 'Ищем соперника… Пригласите друга тоже открыть «Батл», если пока никого нет.'
                  : 'Готовы проверить себя?'}
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
    </main>
  );
}
