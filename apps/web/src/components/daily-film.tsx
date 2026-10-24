'use client';
import { useRouter } from 'next/navigation';
import type { ExperienceSummary } from './experience-panel';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, LoaderCircle } from 'lucide-react';
import type { RoomSession } from '@filmless/contracts';
import { api } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
export function DailyFilm() {
  const router = useRouter();
  const progress = useQuery({
    queryKey: ['experience'],
    queryFn: () => api<ExperienceSummary>('experience'),
    staleTime: 0,
  });
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const completed = progress.data?.daily.find((d) => d.day === day);
  const play = useMutation({
    mutationFn: () => api<RoomSession>('rooms/daily', 'POST'),
    onSuccess: (session) => {
      saveSession(session);
      router.push(`/room/${session.code}`);
    },
  });
  return (
    <section className="home-daily" aria-labelledby="daily-title">
      <span className="home-row-icon">
        <CalendarDays size={21} aria-hidden="true" />
      </span>
      <div className="home-row-copy">
        <h2 id="daily-title">
          Фильм дня<span className="home-daily-tag">Каждый день новый</span>
        </h2>
        <p>
          {completed
            ? `Сегодня: ${completed.score} очков · серия ${progress.data?.streak ?? 0}`
            : 'Одна загадка для всех. Без регистрации.'}
        </p>
      </div>
      <Button
        className="home-daily-button"
        disabled={play.isPending}
        onClick={() => play.mutate()}
      >
        {play.isPending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Открываем…
          </>
        ) : (
          <>
            {completed ? 'Мой результат' : 'Угадать'}
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
      {play.error && (
        <p role="alert" className="home-daily-error">
          {play.error.message}
        </p>
      )}
    </section>
  );
}
