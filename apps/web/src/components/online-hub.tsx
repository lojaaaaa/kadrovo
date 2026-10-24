'use client';
import { markQueue } from './queue-resume';
import { SectionSkeleton } from './section-skeleton';
import Link from 'next/link';
import { m } from './motion-system';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Swords, Users, ArrowRight } from 'lucide-react';
import type { RoomSession } from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
type Queue = {
  status: 'idle' | 'waiting' | 'matched';
  session?: RoomSession;
  waiting?: number;
  required?: number;
};
type Activity = {
  id: string;
  nickname: string;
  score: number;
  players: number;
  finishedAt: number;
};
export function OnlineHub() {
  const router = useRouter(),
    client = useQueryClient();
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const queue = useQuery({
    queryKey: ['quick', account.data?.account?.id],
    queryFn: () => api<Queue>('battle/quick'),
    enabled: !!account.data?.account,
    refetchInterval: 1500,
  });
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api<Activity[]>('rooms/activity'),
    refetchInterval: 3000,
  });
  useEffect(() => {
    const stream = new EventSource('/api/rooms/activity/stream');
    stream.onmessage = (event) => {
      try {
        client.setQueryData(['activity'], JSON.parse(event.data));
      } catch {
        /* Ignore an incomplete update. */
      }
    };
    return () => stream.close();
  }, [client]);
  const action = useMutation({
    mutationFn: (kind: 'duel' | 'group' | 'cancel') =>
      api<Queue>(
        'battle/quick',
        kind === 'cancel' ? 'DELETE' : 'POST',
        kind === 'cancel' ? undefined : { kind },
      ),
    onSuccess: (_, kind) => {
      markQueue(kind !== 'cancel');
      void client.invalidateQueries({ queryKey: ['quick'] });
    },
  });
  const session = queue.data?.session;
  useEffect(() => {
    if (session) {
      saveSession(session);
      router.replace('/room/' + session.code);
    }
  }, [session, router]);
  const waiting = queue.data?.status === 'waiting';
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () =>
        setWaitSeconds(waiting ? Math.floor((Date.now() - started) / 1000) : 0),
      1000,
    );
    return () => clearInterval(timer);
  }, [waiting]);
  return (
    <main className="screen screen--online-hub mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Онлайн</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-5">
          {waiting || queue.data?.status === 'matched' ? (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="queue-wait flex min-h-64 flex-col items-center justify-center gap-5 rounded-2xl border surface-panel bg-card p-8"
              role="status"
            >
              <div className="queue-orbit">
                <LoaderCircle className="size-9 animate-spin text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                {session ? 'Игра найдена' : 'Ищем игроков'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Ожидание {waitSeconds} с
              </p>
              <p className="text-muted-foreground">
                {queue.data?.waiting ?? 0} / {queue.data?.required ?? 2}
              </p>
              <Button
                variant="outline"
                disabled={action.isPending || !!session}
                onClick={() => action.mutate('cancel')}
              >
                Отменить поиск
              </Button>
              {waitSeconds >= 20 && (
                <Link href="/play/solo" className="text-sm text-primary">
                  Тренироваться, пока идёт поиск →
                </Link>
              )}
            </m.div>
          ) : account.isPending ||
            (!!account.data?.account && queue.isPending) ? (
            <SectionSkeleton kind="home" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  id: 'duel' as const,
                  name: 'Дуэль',
                  count: '1 на 1',
                  icon: Swords,
                },
                {
                  id: 'group' as const,
                  name: 'Компания',
                  count: '2–8 игроков',
                  icon: Users,
                },
              ].map(({ id, name, count, icon: Icon }) => (
                <m.div
                  key={id}
                  initial={{ opacity: 0.7, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="quick-mode-card rounded-2xl border surface-panel bg-card p-5"
                >
                  <Icon className="mb-5 size-7 text-primary" />
                  <h2 className="text-2xl font-bold">{name}</h2>
                  <p className="my-3 text-muted-foreground">{count}</p>
                  <Button
                    className="w-full"
                    disabled={action.isPending || account.isPending}
                    onClick={() =>
                      account.data?.account
                        ? action.mutate(id)
                        : router.push('/account')
                    }
                  >
                    Играть
                  </Button>
                </m.div>
              ))}
            </div>
          )}
          {(action.error || queue.error) && (
            <p role="alert" className="text-destructive">
              {action.error?.message || queue.error?.message}
            </p>
          )}
          <Link
            href="/lobbies"
            className="flex items-center justify-between rounded-2xl border p-5 font-semibold hover:border-primary"
          >
            Комнаты и приглашения
            <ArrowRight className="size-5" />
          </Link>
        </section>
        <aside className="rounded-2xl border surface-panel bg-card p-5">
          <h2 className="mb-5 font-bold">
            Последние игры <span className="text-primary">●</span>
          </h2>
          <div aria-live="polite" className="space-y-3">
            {activity.isPending ? (
              <SectionSkeleton />
            ) : activity.data?.length ? (
              activity.data.map((item) => (
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={item.id}
                  className="activity-row flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.nickname}</p>
                    <p className="text-xs text-muted-foreground">
                      Победа · {item.players} игрока
                    </p>
                  </div>
                  <strong>{item.score}</strong>
                </m.div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Здесь появятся результаты открытых игр.
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
