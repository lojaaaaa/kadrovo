'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Film, Sparkles, Play, Users } from 'lucide-react';
import {
  categoryLabels,
  modeLabels,
  collectionDefinitions,
  type ContentAvailability,
  type CreateRoom,
  type CollectionId,
} from '@filmless/contracts';
import { api } from '@/lib/account';
import { CinemaSelect } from './ui/cinema-select';
import { Skeleton } from './ui/skeleton';

const collectionDetails: Record<
  CollectionId,
  {
    icon: string;
    era: string;
    highlights: string[];
  }
> = {
  all: {
    icon: '🎬',
    era: 'Все эпохи',
    highlights: [
      'Шедевры мирового кино',
      'Культовая классика',
      'Свежие премьеры',
    ],
  },
  classics: {
    icon: '📼',
    era: 'До 1990 года',
    highlights: ['«Назад в будущее»', '«Челюсти»', '«Инопланетянин»'],
  },
  nineties: {
    icon: '💾',
    era: '1990–1999',
    highlights: ['«Матрица»', '«Титаник»', '«Один дома»'],
  },
  noughties: {
    icon: '💿',
    era: '2000–2009',
    highlights: ['«Гарри Поттер»', '«Аватар»', '«Шрек»'],
  },
  tens: {
    icon: '✨',
    era: '2010–2019',
    highlights: ['«Интерстеллар»', '«Начало»', '«Зверополис»'],
  },
  recent: {
    icon: '🚀',
    era: '2020 — наши дни',
    highlights: ['«Дюна»', '«Оппенгеймер»', 'Новинки кинотеатров'],
  },
};

export function CollectionsBrowser() {
  const [category, setCategory] = useState<CreateRoom['category']>('movies');
  const [mode, setMode] = useState<CreateRoom['mode']>('frames');

  const data = useQuery({
    queryKey: ['content-availability'],
    queryFn: () => api<ContentAvailability>('content/availability'),
    refetchInterval: 30000,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[.25em] text-primary font-bold">
          Репертуар Filmless
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
          Кино на ваш вкус.
        </h1>
        <p className="mt-1 max-w-2xl leading-relaxed text-muted-foreground text-sm sm:text-base">
          Выберите эпоху и механику. В каждой партии — случайные произведения из
          выбранной киноколлекции с прогрессивными визуальными подсказками.
        </p>
      </div>

      <div className="my-8 grid max-w-xl gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="library-category"
            className="text-sm font-medium mb-1.5 block text-foreground"
          >
            Что угадываем
          </label>
          <CinemaSelect
            id="library-category"
            value={category}
            onChange={(v) => setCategory(v as CreateRoom['category'])}
            options={Object.entries(categoryLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
        <div>
          <label
            htmlFor="library-mode"
            className="text-sm font-medium mb-1.5 block text-foreground"
          >
            Как угадываем
          </label>
          <CinemaSelect
            id="library-mode"
            value={mode}
            onChange={(v) => setMode(v as CreateRoom['mode'])}
            options={Object.entries(modeLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
      </div>

      {data.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-3xl border border-border/50 bg-card p-6 md:p-8 space-y-4"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-6 w-28 rounded-lg" />
                <Skeleton className="size-8 rounded-xl" />
              </div>
              <Skeleton className="h-8 w-1/2 rounded-lg" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <div className="pt-4 border-t border-border/40 flex justify-between">
                <Skeleton className="h-10 w-28 rounded-xl" />
                <Skeleton className="h-10 w-28 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : data.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            Не удалось загрузить подборки. Проверьте соединение или обновите
            страницу.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {collectionDefinitions.map((c) => {
            const count =
              data.data?.collections
                ?.find((v) => v.id === c.id)
                ?.categories.find((v) => v.category === category)?.[mode] ?? 0;
            const params = `collection=${c.id}&category=${category}&mode=${mode}`;
            const details = collectionDetails[c.id];

            return (
              <article
                key={c.id}
                className="group relative rounded-3xl border border-border/70 bg-card p-6 md:p-8 transition-all duration-200 hover:border-zinc-700 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-secondary px-3 py-1 text-xs font-semibold">
                      <span className="text-base">{details.icon}</span>
                      <span>{details.era}</span>
                    </span>
                    <Film className="size-5 text-muted-foreground" />
                  </div>

                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {categoryLabels[category]} · {modeLabels[mode]}
                  </p>

                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">
                    {c.name}
                  </h2>

                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {c.description}
                  </p>

                  {/* Representative Movie Tags */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {details.highlights.map((h) => (
                      <span
                        key={h}
                        className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
                      >
                        {h}
                      </span>
                    ))}
                  </div>

                  <div className="my-5 flex items-center gap-2 text-xs font-semibold">
                    <span className="size-2 rounded-full bg-primary" />
                    <span className="text-primary">
                      {count > 0
                        ? `${count} доступных загадок`
                        : 'Каталог готов к игре'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/40 pt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Link
                      href={`/play/solo?${params}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:brightness-110 transition active:scale-95"
                    >
                      <Play className="size-3.5 fill-current" />
                      Играть соло
                    </Link>
                    <Link
                      href={`/play/party?${params}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-secondary px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-zinc-800 transition active:scale-95"
                    >
                      <Users className="size-3.5" />С друзьями
                    </Link>
                  </div>

                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                    <Sparkles className="size-3.5 text-primary" /> 5 раундов
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
