'use client';

import { CollectionPicker } from './collection-picker';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  categoryLabels,
  timeControlPresets,
  type CreateRoom,
  type ContentAvailability,
  type RoundCount,
} from '@filmless/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type AccountState } from '@/lib/account';
import { roomRequest, saveSession } from '@/lib/rooms';
import {
  Film,
  Search,
  Shuffle,
  Grid,
  Zap,
  Timer,
  Target,
  Clock,
  Coffee,
  Check,
  Sparkles,
  ArrowRight,
  User,
  Tv,
  Clapperboard,
  Palette,
} from 'lucide-react';

const modeCardDetails = [
  {
    id: 'frames' as const,
    name: 'Кадры',
    tagline: '5 кадров истории',
    description: 'От атмосферных деталей к культовым сценам',
    icon: Film,
  },
  {
    id: 'spotlight' as const,
    name: 'Лупа',
    tagline: 'Постер с зумом',
    description: 'Постер приближен и открывается секциями',
    icon: Search,
  },
  {
    id: 'mix' as const,
    name: 'Микс',
    tagline: 'Чередование механик',
    description: 'Случайная смена кадров и лупы каждый раунд',
    icon: Shuffle,
  },
  {
    id: 'pixels' as const,
    name: 'Пиксели',
    tagline: 'Фокусировка',
    description: 'Постепенная депикселизация от крупных блоков',
    icon: Grid,
  },
];

const timeIcons: Record<number, typeof Zap> = {
  15: Zap,
  30: Timer,
  45: Target,
  60: Clock,
  90: Coffee,
};

export function CreateRoomForm({
  initialFormat = 'party',
  initialMode = 'frames',
  initialCollection = 'all',
  initialCategory = 'movies',
}: {
  initialFormat?: 'party' | 'solo';
  initialMode?: CreateRoom['mode'];
  initialCollection?: NonNullable<CreateRoom['collection']>;
  initialCategory?: CreateRoom['category'];
}) {
  const router = useRouter();
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });

  const format = initialFormat;
  const [totalRounds, setTotalRounds] = useState<RoundCount>(5);
  const [roundSeconds, setRoundSeconds] = useState<15 | 30 | 45 | 60 | 90>(45);
  const [customNickname, setNickname] = useState<string | null>(null);
  const nickname = customNickname ?? account.data?.account?.nickname ?? '';
  const [category, setCategory] =
    useState<CreateRoom['category']>(initialCategory);
  const [mode, setMode] = useState<CreateRoom['mode']>(initialMode);
  const [collection, setCollection] =
    useState<NonNullable<CreateRoom['collection']>>(initialCollection);
  const [chosenSource] = useState<'demo' | 'catalog' | null>(null);

  const availability = useQuery({
    queryKey: ['content-availability'],
    refetchInterval: 30000,
    retry: 1,
    queryFn: async () => {
      const response = await fetch('/api/content/availability');
      if (!response.ok) throw new Error('Каталог недоступен');
      return response.json() as Promise<ContentAvailability>;
    },
  });

  const count =
    availability.data?.collections
      ?.find((c) => c.id === collection)
      ?.categories.find((c) => c.category === category)?.[mode] ?? 0;

  const canUseCatalog = availability.data?.ready === true && count >= 3;
  const source = chosenSource ?? (canUseCatalog ? 'catalog' : 'demo');

  const selectedPreset =
    timeControlPresets.find((p) => p.seconds === roundSeconds) ??
    timeControlPresets[2];

  const mutation = useMutation({
    mutationFn: async () => {
      const session = await roomRequest('', {
        nickname:
          nickname.trim() || (format === 'solo' ? 'Киноман' : 'Капитан'),
        format,
        roundSeconds,
        totalRounds,
        category,
        mode,
        source,
        collection: source === 'catalog' ? collection : 'all',
      });
      saveSession(session);
      return session;
    },
    onSuccess: (s) => router.push(`/room/${s.code}`),
  });

  return (
    <form
      className="space-y-8 rounded-3xl border border-border/70 bg-card p-6 shadow-2xl md:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {/* 1. Game Mode Cards */}
      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            <Clapperboard className="size-4 text-primary" />
            Механика угадывания
          </legend>
          <span className="text-xs text-muted-foreground">
            Выберите формат игры
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modeCardDetails.map((m) => {
            const isSelected = mode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setMode(m.id);
                  setCollection('all');
                }}
                className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? 'border-primary bg-secondary ring-1 ring-primary/50 shadow-md'
                    : 'border-border/60 bg-secondary/50 hover:border-zinc-700 hover:bg-secondary'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex size-10 items-center justify-center rounded-xl border ${
                        isSelected
                          ? 'border-primary bg-primary text-white'
                          : 'border-border/60 bg-card text-muted-foreground group-hover:text-foreground'
                      }`}
                    >
                      <Icon className="size-5" />
                    </span>
                    {isSelected ? (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="size-5 rounded-full border border-border/60 group-hover:border-zinc-500" />
                    )}
                  </div>
                  <h3 className="mt-3 text-base font-bold text-white">
                    {m.name}
                  </h3>
                  <p className="text-xs font-semibold text-primary">
                    {m.tagline}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">
                    {m.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 2. Round Count & Time Controls (Chess-like) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Total Rounds */}
        <fieldset className="space-y-3">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Количество раундов
            </legend>
            <span className="text-xs text-muted-foreground">Длительность</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {([3, 5, 7, 10] as const).map((rounds) => {
              const isSelected = totalRounds === rounds;
              return (
                <button
                  key={rounds}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTotalRounds(rounds)}
                  className={`flex flex-col items-center justify-center rounded-2xl border py-3 px-2 text-center transition-all ${
                    isSelected
                      ? 'border-primary bg-secondary text-primary font-bold ring-1 ring-primary/40 shadow-sm'
                      : 'border-border/60 bg-secondary/50 text-foreground hover:border-zinc-700 hover:bg-secondary'
                  }`}
                >
                  <span className="text-lg font-black">{rounds}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {rounds === 3 ? 'раунда' : 'раундов'}
                  </span>
                  {rounds === 5 && (
                    <span className="mt-1 rounded-full bg-primary/20 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                      Хит
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Time Control Presets */}
        <fieldset className="space-y-3">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <Timer className="size-4 text-primary" />
              Темп игры на раунд
            </legend>
            <span className="text-xs text-muted-foreground">
              Шахматный таймер
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {timeControlPresets.map((preset) => {
              const isSelected = roundSeconds === preset.seconds;
              const Icon = timeIcons[preset.seconds] ?? Timer;
              return (
                <button
                  key={preset.seconds}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    setRoundSeconds(preset.seconds as 15 | 30 | 45 | 60 | 90)
                  }
                  className={`flex flex-col items-center justify-center rounded-2xl border py-2.5 px-1 text-center transition-all ${
                    isSelected
                      ? 'border-primary bg-secondary text-primary font-bold ring-1 ring-primary/40 shadow-sm'
                      : 'border-border/60 bg-secondary/50 text-foreground hover:border-zinc-700 hover:bg-secondary'
                  }`}
                  title={preset.description}
                >
                  <Icon className="size-4 mb-1" />
                  <span className="text-xs font-extrabold">{preset.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {preset.seconds}с
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* 3. Category & Player Nickname */}
      <div className="grid gap-6 md:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            <Palette className="size-4 text-primary" />
            Категория произведений
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'movies', label: 'Фильмы', icon: Film },
                { id: 'series', label: 'Сериалы', icon: Tv },
                { id: 'animation', label: 'Мультфильмы', icon: Sparkles },
              ] as const
            ).map((cat) => {
              const isSelected = category === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setCategory(cat.id);
                    setCollection('all');
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl border py-2.5 px-3 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'border-primary bg-secondary text-primary font-bold ring-1 ring-primary/40 shadow-sm'
                      : 'border-border/60 bg-secondary/50 text-foreground hover:border-zinc-700 hover:bg-secondary'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-3">
          <Label
            htmlFor="player-nickname"
            className="text-sm font-semibold tracking-tight text-white flex items-center gap-2"
          >
            <User className="size-4 text-primary" />
            Ваше имя в игре
          </Label>
          <div className="relative">
            <Input
              id="player-nickname"
              className="h-11 rounded-2xl border-border/60 bg-secondary/70 pl-3 pr-20 text-sm focus:border-primary text-white"
              placeholder={format === 'solo' ? 'Киноман' : 'Капитан'}
              maxLength={24}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <span className="absolute right-3 top-3 text-[11px] text-muted-foreground select-none">
              {nickname.length}/24
            </span>
          </div>
        </div>
      </div>

      {/* 4. Collection Picker */}
      <div className="border-t border-border/40 pt-6">
        <CollectionPicker
          value={collection}
          onChange={setCollection}
          availability={availability.data}
          category={category}
          mode={mode}
          isLoading={availability.isPending}
        />
      </div>

      {/* 5. Error & Status Notifications */}
      {!availability.isPending && source === 'catalog' && !canUseCatalog && (
        <div className="rounded-2xl border border-zinc-800 bg-secondary/50 p-4 text-xs text-muted-foreground">
          Для выбранной комбинации каталог готовит новые загадки. Игра
          запустится на проверенной подборке шедевров.
        </div>
      )}

      {mutation.error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive"
        >
          {mutation.error.message}
        </div>
      )}

      {/* 6. Summary Bar & CTA Button */}
      <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground text-center sm:text-left">
          <span className="font-semibold text-white">Параметры матча:</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-foreground">
            {categoryLabels[category]}
          </span>
          <span>·</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-foreground">
            {totalRounds} раундов
          </span>
          <span>·</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-foreground">
            {selectedPreset.name} ({roundSeconds}с)
          </span>
          <span>·</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-primary">
            {source === 'demo' ? 'Демо' : 'Каталог'}
          </span>
        </div>

        <Button
          size="lg"
          className="w-full sm:w-auto min-w-56 h-13 rounded-2xl text-base font-bold bg-primary text-white hover:brightness-110 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Создаём сессию…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {format === 'solo' ? 'Начать тренировку' : 'Создать комнату'}
              <ArrowRight className="size-4 stroke-[2.5]" />
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}
