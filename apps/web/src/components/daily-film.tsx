'use client';
import { useEffect, useState } from 'react';
import { dailyCountdown } from '@/lib/daily-clock';
import { useRouter } from 'next/navigation';
import type { ExperienceSummary } from './experience-panel';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, LoaderCircle } from 'lucide-react';
import type { RoomSession } from '@filmless/contracts';
import { api } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
export function DailyFilm() {
  const router = useRouter();
  const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const progress = useQuery({
    queryKey: ['experience'],
    queryFn: () => api<ExperienceSummary>('experience'),
    staleTime: 0,
  });
  const daily = progress.data?.currentDaily;
  const completed = progress.data?.daily.find((d) => d.day === daily?.day);
  const countdown = daily
    ? dailyCountdown(
        daily.nextAt,
        daily.serverTime,
        progress.dataUpdatedAt,
        now,
      )
    : null;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (countdown?.expired)
      void client.invalidateQueries({ queryKey: ['experience'] });
  }, [countdown?.expired, client]);
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
          Фильм дня
          <span
            className="home-daily-tag"
            title="Новое задание в полночь по Москве"
          >
            {countdown && !countdown.expired
              ? `Новое через ${countdown.text}`
              : 'Каждый день новый'}
          </span>
        </h2>
        <p>
          {completed
            ? `Сегодня: ${completed.score} очков · серия ${progress.data?.streak ?? 0}`
            : daily?.status === 'in-progress'
              ? 'Вы уже начали — продолжите с прежнего места.'
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
            {completed
              ? 'Мой результат'
              : daily?.status === 'in-progress'
                ? 'Продолжить'
                : 'Угадать'}
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
