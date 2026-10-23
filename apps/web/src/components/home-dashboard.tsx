'use client';

import Link from 'next/link';
import { DailyFilm } from './daily-film';
import { useQuery } from '@tanstack/react-query';
import {
  Film,
  Grid2X2,
  ScanSearch,
  Shuffle,
  Users,
  ArrowUpRight,
  Clapperboard,
  UserRound,
  Swords,
  Play,
  ChevronRight,
} from 'lucide-react';
import { api, type AccountState } from '@/lib/account';
import { JoinRoomForm } from './join-room';
import { Skeleton } from './ui/skeleton';

const modeCards = [
  {
    id: 'frames',
    name: 'Кадры',
    desc: '5 кадров фильма от деталей к культовым сценам.',
    icon: Film,
    href: '/play/solo?mode=frames',
  },
  {
    id: 'spotlight',
    name: 'Лупа',
    desc: 'Постер приближен и открывается секциями.',
    icon: ScanSearch,
    href: '/play/solo?mode=spotlight',
  },
  {
    id: 'mix',
    name: 'Микс',
    desc: 'Случайная смена механик в каждом раунде.',
    icon: Shuffle,
    href: '/play/solo?mode=mix',
  },
  {
    id: 'pixels',
    name: 'Пиксели',
    desc: 'Постепенная депикселизация знакомого кадра.',
    icon: Grid2X2,
    href: '/play/solo?mode=pixels',
  },
] as const;

export function HomeDashboard() {
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-4 md:px-6">
      <h1 className="sr-only">Кадрово — угадай кино</h1>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Hero action cards - high-end Apple dark style */}
          <section className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/play/party"
              className="group relative rounded-3xl border border-border/70 bg-card p-6 transition-all hover:border-zinc-700 hover:bg-secondary/40"
            >
              <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Users className="size-5" />
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-white flex items-center justify-between">
                С друзьями
                <ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Создайте комнату и отправьте ссылку. Общие вопросы и живой счёт.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                До 8 игроков
              </span>
            </Link>

            <Link
              href="/play/solo"
              className="group relative rounded-3xl border border-border/70 bg-card p-6 transition-all hover:border-zinc-700 hover:bg-secondary/40"
            >
              <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Clapperboard className="size-5" />
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-white flex items-center justify-between">
                Соло
                <ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Тренировка в своём темпе. Любые эпохи, механики и таймер без
                ограничений.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground/80">
                4 режима игры
              </span>
            </Link>

            <Link
              href="/battle"
              className="group relative rounded-3xl border border-border/70 bg-card p-6 transition-all hover:border-primary/50 hover:bg-secondary/40"
            >
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white">
                <Swords className="size-5" />
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-white flex items-center justify-between">
                Батл 1:1
                <ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Случайный соперник. Одинаковые загадки. Побеждает быстрейший.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
                Рейтинг Эло
              </span>
            </Link>
          </section>

          {/* Collections banner */}
          <Link
            href="/collections"
            className="group flex items-center justify-between gap-5 rounded-3xl border border-border/70 bg-card p-6 transition-all hover:border-zinc-700"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">
                Репертуар
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
                Классика, 90-е, 2000-е, новинки и мультфильмы
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Выберите эпоху — и соревнуйтесь по фильмам своего любимого
                поколения.
              </p>
            </div>
            <ChevronRight className="size-6 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </Link>

          {/* Mode cards */}
          <section className="rounded-3xl border border-border/70 bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[.2em] text-muted-foreground">
                Выберите механику для тренировки
              </h2>
              <span className="text-xs text-primary font-semibold">
                4 режима
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {modeCards.map((m) => {
                const Icon = m.icon;
                return (
                  <Link
                    href={m.href}
                    key={m.id}
                    className="group rounded-2xl border border-border/60 bg-secondary/50 p-5 transition-all hover:border-primary/50 hover:bg-secondary"
                  >
                    <Icon className="mb-3 size-6 text-primary" />
                    <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                      {m.name}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      {m.desc}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-semibold">
                      <Play className="size-3 fill-current" /> Играть
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <DailyFilm />

          <section className="rounded-3xl border border-border/70 bg-card p-6">
            {account.isPending ? (
              <div className="space-y-3">
                <Skeleton className="size-8 rounded-xl" />
                <Skeleton className="h-4 w-24 rounded-lg" />
                <Skeleton className="h-7 w-40 rounded-xl" />
                <Skeleton className="h-4 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
                <Skeleton className="mt-2 h-9 w-full rounded-xl border" />
              </div>
            ) : (
              <>
                <UserRound className="mb-4 size-8 text-primary" />
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Ваш кинозал
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {account.data?.account?.nickname ?? 'Рады знакомству'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {account.data?.account
                    ? 'Ваш ник и настройки игры — в профиле.'
                    : 'Играйте без регистрации. Для рейтинга и дуэлей — войдите в аккаунт.'}
                </p>
                <Link
                  href={account.data?.account ? '/profile' : '/account'}
                  className="mt-5 flex items-center justify-between border-t border-border/50 pt-4 text-sm font-semibold text-primary hover:underline"
                >
                  {account.data?.account
                    ? 'Профиль и настройки'
                    : 'Войти в аккаунт'}
                  <ArrowUpRight className="size-4" />
                </Link>
              </>
            )}
          </section>

          <JoinRoomForm />

          <section className="rounded-3xl border border-border/70 bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Правила начисления
            </p>
            <h2 className="mt-2 text-lg font-bold leading-snug text-white">
              Меньше подсказок — больше очков
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Каждая новая подсказка: −5 секунд времени и −4 очка из награды.
            </p>
            <div className="mt-4 grid grid-cols-5 gap-1.5 text-center">
              {[20, 16, 12, 8, 4].map((pts, i) => (
                <div
                  key={pts}
                  className="rounded-xl border border-border/50 bg-secondary py-2.5 px-1"
                >
                  <div className="text-sm font-black text-primary">+{pts}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {i + 1} кадр
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border/50 pt-6 text-xs text-muted-foreground">
        <span>Кадрово · Кино объединяет</span>
        <span>Каждый играет со своего экрана</span>
      </footer>
    </main>
  );
}
