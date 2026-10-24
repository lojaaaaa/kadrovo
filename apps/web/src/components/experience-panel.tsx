'use client';
/* eslint-disable @next/next/no-img-element -- Authorized game rasters and private media use the same origin cache. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { RoomSession, TitleOption } from '@filmless/contracts';
import { api } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
export type ExperienceSummary = {
  streak: number;
  seen: number;
  watchlist: TitleOption[];
  daily: { day: string; score: number; solved: boolean }[];
};
export function ExperiencePanel() {
  const client = useQueryClient(),
    router = useRouter();
  const data = useQuery({
    queryKey: ['experience'],
    queryFn: () => api<ExperienceSummary>('experience'),
    staleTime: 0,
  });
  const archiveDays = useQuery({
    queryKey: ['daily-archive'],
    queryFn: () => api<{ day: string }[]>('experience/archive'),
  });
  const remove = useMutation({
    mutationFn: (titleId: string) =>
      api('experience/watchlist', 'POST', { titleId, remove: true }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['experience'] });
    },
  });
  const archive = useMutation({
    mutationFn: (day: string) =>
      api<RoomSession>('experience/daily/' + day, 'POST'),
    onSuccess: (s) => {
      saveSession(s);
      router.push('/room/' + s.code);
    },
  });
  return (
    <section className="mt-5 rounded-2xl border bg-card p-5 space-y-5">
      <h2 className="text-xl font-bold">Мои фильмы</h2>
      {data.isPending ? (
        <p role="status">Загружаем историю…</p>
      ) : data.error ? (
        <p role="alert">{data.error.message}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Показано фильмов: {data.data?.seen ?? 0} · Серия ежедневных побед:{' '}
            {data.data?.streak ?? 0}
          </p>
          <h3 className="font-semibold">Посмотреть позже</h3>
          {data.data?.watchlist.length ? (
            <div className="review-films">
              {data.data.watchlist.map((t) => (
                <article className="review-film" key={t.id}>
                  {t.posterUrl && (
                    <img src={t.posterUrl} alt="" loading="lazy" />
                  )}
                  <div className="flex-1">
                    <p>{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.year}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(t.id)}
                  >
                    Убрать
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Сохраняйте заинтересовавшие фильмы после игры.
            </p>
          )}
          <details>
            <summary className="cursor-pointer">
              Ежедневные задания · {data.data?.daily.length ?? 0}
            </summary>
            <div className="mt-3 space-y-2">
              {(archiveDays.data ?? data.data?.daily ?? []).map((entry) => {
                const d = data.data?.daily.find((v) => v.day === entry.day) ?? {
                  day: entry.day,
                  score: undefined,
                  solved: false,
                };
                return (
                  <div
                    key={d.day}
                    className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"
                  >
                    <span>
                      {d.day} ·{' '}
                      {d.score === undefined
                        ? 'Ещё не сыграно'
                        : `${d.solved ? 'Угадано' : 'Не угадано'} · ${d.score} очков`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => archive.mutate(d.day)}
                      disabled={archive.isPending}
                    >
                      Тренировка
                    </Button>
                  </div>
                );
              })}
            </div>
          </details>
        </>
      )}
      {(archive.error || remove.error) && (
        <p role="alert">{archive.error?.message ?? remove.error?.message}</p>
      )}
    </section>
  );
}
