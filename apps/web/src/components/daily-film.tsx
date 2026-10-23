'use client';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { RoomSession } from '@filmless/contracts';
import { api } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
export function DailyFilm() {
  const router = useRouter();
  const play = useMutation({
    mutationFn: () => api<RoomSession>('rooms/daily', 'POST'),
    onSuccess: (session) => {
      saveSession(session);
      router.push(`/room/${session.code}`);
    },
  });
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">
          Фильм дня
        </span>
        <span className="text-xs text-muted-foreground">Ежедневно</span>
      </div>
      <h2 className="mt-3 text-xl font-bold text-white">
        Один день. Одна загадка.
      </h2>
      <p className="my-3 text-xs leading-relaxed text-muted-foreground">
        Общий фильм для всех. 5 кадров и 45 секунд, чтобы вспомнить название.
      </p>
      <Button
        className="w-full rounded-2xl bg-primary text-white font-bold h-12 shadow-md shadow-primary/20 hover:brightness-110 active:scale-95"
        disabled={play.isPending}
        onClick={() => play.mutate()}
      >
        {play.isPending ? 'Открываем…' : 'Угадать фильм дня'}
      </Button>
      {play.error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {play.error.message}
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground text-center">
        Без регистрации · обновляется в полночь
      </p>
    </section>
  );
}
