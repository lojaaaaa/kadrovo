'use client';

import {
  collectionDefinitions,
  type CollectionId,
  type ContentAvailability,
  type CreateRoom,
} from '@filmless/contracts';
import { Skeleton } from '@/components/ui/skeleton';
import { Film, Sparkles, Check } from 'lucide-react';

const collectionMetadata: Record<
  CollectionId,
  {
    badge: string;
    icon: string;
    notable: string;
  }
> = {
  all: {
    badge: 'Все эпохи',
    icon: '🎬',
    notable: 'Титаник · Матрица · Интерстеллар',
  },
  classics: {
    badge: 'До 1990',
    icon: '📼',
    notable: 'Назад в будущее · Челюсти · Чужой',
  },
  nineties: {
    badge: '1990-е',
    icon: '💾',
    notable: 'Матрица · Один дома · Король Лев',
  },
  noughties: {
    badge: '2000-е',
    icon: '💿',
    notable: 'Гарри Поттер · Аватар · Шрек',
  },
  tens: {
    badge: '2010-е',
    icon: '✨',
    notable: 'Интерстеллар · Начало · Зверополис',
  },
  recent: {
    badge: '2020+',
    icon: '🚀',
    notable: 'Дюна · Оппенгеймер · Новинки',
  },
};

export function CollectionPicker({
  value,
  onChange,
  availability,
  category,
  mode,
  disabled = false,
  isLoading = false,
}: {
  value: CollectionId;
  onChange: (value: CollectionId) => void;
  availability?: ContentAvailability;
  category: CreateRoom['category'];
  mode: CreateRoom['mode'];
  disabled?: boolean;
  isLoading?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Film className="size-4 text-primary" />
          Выберите подборку фильмов
        </legend>
        <span className="text-xs text-muted-foreground">Эпохи и темы</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {collectionDefinitions.map((list) => {
          const meta = collectionMetadata[list.id];
          const isSelected = value === list.id;

          if (isLoading) {
            return (
              <div
                key={list.id}
                className="rounded-2xl border border-border/50 surface-panel bg-card p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="size-5 rounded-full" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-4 w-24 pt-2" />
              </div>
            );
          }

          const count =
            availability?.collections
              ?.find((c) => c.id === list.id)
              ?.categories.find((c) => c.category === category)?.[mode] ?? 0;
          const isAvailable = availability ? count >= 3 : true;

          return (
            <button
              key={list.id}
              type="button"
              aria-pressed={isSelected}
              disabled={!isAvailable}
              onClick={() => onChange(list.id)}
              className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? 'border-primary bg-secondary/80 ring-1 ring-primary/50 shadow-md'
                  : 'border-border/60 surface-panel bg-card hover:border-zinc-700 hover:bg-secondary/40'
              } ${!isAvailable ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary px-2.5 py-1 text-xs font-semibold">
                  <span className="text-sm">{meta.icon}</span>
                  <span>{meta.badge}</span>
                </span>
                {isSelected ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="size-5 rounded-full border border-border/60 group-hover:border-zinc-500" />
                )}
              </div>

              <div className="mt-3">
                <span className="block font-bold text-foreground text-sm tracking-tight">
                  {list.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground line-clamp-1">
                  {list.description}
                </span>
                <span className="mt-1.5 block text-[11px] font-medium text-muted-foreground/80">
                  {meta.notable}
                </span>
              </div>

              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                <span
                  className={
                    isAvailable
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground'
                  }
                >
                  {count > 0 ? `${count} загадок` : 'Каталог готов'}
                </span>
                {!isAvailable && (
                  <span className="text-[11px] text-muted-foreground/70">
                    Пополняется
                  </span>
                )}
                {isAvailable && isSelected && (
                  <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
                    <Sparkles className="size-3" /> Выбрано
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
