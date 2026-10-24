'use client';
import { useState } from 'react';
import { PosterImage } from './poster-image';
import { SectionSkeleton } from './section-skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { RoomSession, TitleOption } from '@filmless/contracts';
import { api } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
import { Bookmark, Film, Flame, CalendarDays, ChevronDown } from 'lucide-react';
export type ExperienceSummary = {
  access?: { guest: boolean; soloRemaining: number; onlineRemaining: number };
  currentDaily: {
    day: string;
    nextAt: number;
    serverTime: number;
    status: 'new' | 'in-progress' | 'completed';
  };
  streak: number;
  seen: number;
  watchlist: TitleOption[];
  daily: { day: string; score: number; solved: boolean }[];
};
export function ExperiencePanel() {
  const [open, setOpen] = useState(false);
  const client = useQueryClient(),
    router = useRouter();
  const data = useQuery({
    queryKey: ['experience'],
    enabled: open,
    queryFn: () => api<ExperienceSummary>('experience'),
    staleTime: 0,
  });
  const archiveDays = useQuery({
    queryKey: ['daily-archive'],
    enabled: open,
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
    <details
      className="personal-library mt-5 rounded-2xl border bg-card"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="library-disclosure">
        <span>
          <Film size={19} />
          Мои фильмы
        </span>
        <span>
          {open ? 'Свернуть' : 'Посмотреть'}
          <ChevronDown size={17} />
        </span>
      </summary>
      {open && (
        <div className="library-body">
          {data.isPending || (data.isFetching && !data.isFetchedAfterMount) ? (
            <SectionSkeleton kind="list" />
          ) : data.error ? (
            <p role="alert">{data.error.message}</p>
          ) : (
            <>
              <header className="library-header">
                <div className="library-stats">
                  <span>
                    <Film size={15} /> {data.data?.seen ?? 0} показано
                  </span>
                  <span>
                    <Flame size={15} /> Серия: {data.data?.streak ?? 0}
                  </span>
                </div>
              </header>
              <div className="library-watchlist">
                <h3>
                  <Bookmark size={17} /> Посмотреть позже{' '}
                  <span>{data.data?.watchlist.length ?? 0}</span>
                </h3>
                {data.data?.watchlist.length ? (
                  <div className="review-films">
                    {data.data.watchlist.map((t) => (
                      <article className="review-film" key={t.id}>
                        {t.posterUrl && <PosterImage src={t.posterUrl} />}
                        <div className="flex-1">
                          <p>{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.year}
                          </p>
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
                  <div className="library-empty">
                    <Bookmark size={25} />
                    <p>
                      Здесь будут сохранённые фильмы.
                      <small>Добавляйте их из результатов игры.</small>
                    </p>
                  </div>
                )}
              </div>
              <details className="library-daily">
                <summary className="cursor-pointer">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays size={17} /> История фильма дня{' '}
                    <span className="text-muted-foreground">
                      {data.data?.daily.filter(
                        (d) => d.day < data.data.currentDaily.day,
                      ).length ?? 0}
                    </span>
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  {archiveDays.isPending ? (
                    <SectionSkeleton />
                  ) : (
                    (archiveDays.data ?? data.data?.daily ?? [])
                      .filter(
                        (d) => d.day < (data.data?.currentDaily.day ?? ''),
                      )
                      .map((entry) => {
                        const d = data.data?.daily.find(
                          (v) => v.day === entry.day,
                        ) ?? {
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
                      })
                  )}
                </div>
              </details>
            </>
          )}
          {(archive.error || remove.error) && (
            <p role="alert">
              {archive.error?.message ?? remove.error?.message}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
