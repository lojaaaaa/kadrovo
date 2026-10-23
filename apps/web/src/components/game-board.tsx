'use client';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Film,
  Sparkles,
  RotateCcw,
  Share2,
  Settings2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sound';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  modeLabels,
  categoryLabels,
  type GameSnapshot,
  type GamePersonal,
  type TitleOption,
  type SearchAck,
  type AnswerAck,
  type RoomAck,
} from '@filmless/contracts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';

export function GameBoard({
  game,
  personal,
  getSocket,
  connected,
  receivedAt,
  playerId,
  leave,
  restart,
  restarting,
  isHost,
  format,
  onOpenLobby,
}: {
  game: GameSnapshot;
  personal: GamePersonal | null;
  getSocket: () => Socket | null;
  connected: boolean;
  receivedAt: number;
  playerId: string;
  leave: () => void;
  restart?: () => void;
  restarting?: boolean;
  isHost?: boolean;
  format?: 'party' | 'solo' | 'battle';
  onOpenLobby?: () => void;
}) {
  const [clock, setClock] = useState({ anchor: receivedAt, elapsed: 0 });
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const update = () =>
      setClock({
        anchor: receivedAt,
        elapsed: Math.max(0, performance.now() - receivedAt),
      });
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [receivedAt]);
  const now =
    game.serverNow + (clock.anchor === receivedAt ? clock.elapsed : 0);
  const remaining = Math.max(
    0,
    Math.ceil(
      ((game.phase === 'playing' ? game.endsAt : game.nextAt) - now) / 1000,
    ),
  );
  useEffect(() => {
    if (!connected) return;
    const cue =
      game.phase === 'finished'
        ? 'finish'
        : game.phase === 'reveal'
          ? 'reveal'
          : game.stage === 0
            ? 'round'
            : 'hint';
    playSound(
      cue,
      `${game.matchId}:${game.roundId}:${game.phase}:${game.stage}`,
    );
  }, [connected, game.matchId, game.roundId, game.phase, game.stage]);
  useEffect(() => {
    if (
      connected &&
      game.phase === 'playing' &&
      !game.standings.some((p) => p.playerId === playerId && p.solved) &&
      remaining > 0 &&
      remaining <= 5
    )
      playSound('tick', `${game.roundId}:tick:${remaining}`);
  }, [
    connected,
    game.phase,
    game.roundId,
    remaining,
    game.standings,
    playerId,
  ]);
  const navigation = useMutation({
    mutationFn: async (stage: number) => {
      const socket = getSocket();
      if (!socket?.connected) throw new Error('Нет соединения.');
      const ack: RoomAck = await socket
        .timeout(5000)
        .emitWithAck('game:hint', { roundId: game.roundId, stage });
      if (!ack.ok) throw new Error(ack.message);
    },
  });
  const unlocked = game.unlockedStage ?? 0;
  const mine = game.standings.find((p) => p.playerId === playerId);
  const { mutate: navigate, isPending: navigating } = navigation;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      if (
        game.phase !== 'playing' ||
        !connected ||
        remaining === 0 ||
        mine?.solved
      )
        return;
      if (
        event.key === '/' ||
        (event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey)
      ) {
        if (event.key === '/') event.preventDefault();
        document.getElementById('answer-search')?.focus();
      } else if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !navigating
      ) {
        const next = game.stage + (event.key === 'ArrowRight' ? 1 : -1);
        if (next >= 0 && next <= 4) {
          event.preventDefault();
          playSound('whoosh');
          navigate(next);
        }
      } else if (
        event.key === 'Enter' &&
        !(target instanceof HTMLElement && target.closest('button,a,summary'))
      ) {
        event.preventDefault();
        (
          document.getElementById('answer-form') as HTMLFormElement | null
        )?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    game.phase,
    game.stage,
    connected,
    remaining,
    mine?.solved,
    navigating,
    navigate,
  ]);
  if (game.phase === 'finished') {
    return (
      <FinishedGameScreen
        game={game}
        playerId={playerId}
        leave={leave}
        restart={restart}
        restarting={restarting}
        isHost={isHost}
        format={format}
        onOpenLobby={onOpenLobby}
      />
    );
  }

  return (
    <section
      className={`game-board ${game.mode === 'spotlight' ? 'game-spotlight' : ''} rounded-2xl border border-border/70 bg-card p-3 sm:p-4 game-viewport`}
      aria-label="Партия"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Раунд {game.roundNumber} из {game.totalRounds}
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-white">
            {modeLabels[game.mode]}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={leave}
            className="h-11 border-border/70 text-muted-foreground hover:text-white"
          >
            <LogOut className="size-4" />
            <span>Выйти</span>
          </Button>
          <p
            className={`rounded-xl px-3 py-2 text-2xl font-black tabular-nums ${
              remaining <= 5 && game.phase === 'playing'
                ? 'bg-destructive/20 text-destructive'
                : 'bg-secondary text-white'
            }`}
            aria-label="Осталось секунд"
          >
            {game.phase === 'playing' && mine?.solved ? '✓' : remaining}
            <span className="ml-1 text-sm text-muted-foreground font-normal">
              {game.phase === 'playing' && mine?.solved ? 'угадано' : 'с'}
            </span>
          </p>
        </div>
      </div>
      <div className="gameplay-layout">
        <div className="game-image-group">
          <div
            className={`game-image relative overflow-hidden rounded-xl border bg-black/60 transition-transform duration-200 ${
              zoomed ? 'scale-110 z-20 shadow-2xl' : ''
            }`}
          >
            {/* Server sends only the current raster image; future hints are never preloaded. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={game.image}
              alt={`Визуальная подсказка ${game.stage + 1} из 5`}
              width={600}
              height={600}
              className="absolute inset-0 size-full object-contain select-none pointer-events-none"
            />
            {game.phase === 'playing' && (
              <>
                {/* Split-click Left Zone (Previous Hint · Free) */}
                <button
                  type="button"
                  aria-label="Предыдущий кадр (нажмите слева)"
                  title="Предыдущий кадр · бесплатно"
                  disabled={
                    !connected ||
                    navigating ||
                    game.stage === 0 ||
                    remaining === 0 ||
                    !!mine?.solved
                  }
                  onClick={() => {
                    playSound('whoosh');
                    navigate(game.stage - 1);
                  }}
                  className="group/left absolute inset-y-0 left-0 w-1/2 z-10 cursor-pointer focus:outline-none"
                >
                  <span className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/80 opacity-0 shadow-lg transition-opacity group-hover/left:opacity-100">
                    <ChevronLeft className="size-6" />
                  </span>
                </button>

                {/* Split-click Right Zone (Next Hint · -5s, -4 pts) */}
                <button
                  type="button"
                  aria-label={
                    game.stage < unlocked
                      ? 'Следующий открытый кадр (нажмите справа)'
                      : 'Новый кадр (нажмите справа): минус 5 секунд и 4 очка'
                  }
                  title={
                    game.stage < unlocked
                      ? 'Следующий кадр · бесплатно'
                      : 'Новый кадр · −5 секунд, −4 очка'
                  }
                  disabled={
                    !connected ||
                    navigating ||
                    game.stage === 4 ||
                    remaining === 0 ||
                    !!mine?.solved
                  }
                  onClick={() => {
                    playSound('whoosh');
                    navigate(game.stage + 1);
                  }}
                  className="group/right absolute inset-y-0 right-0 w-1/2 z-10 cursor-pointer focus:outline-none"
                >
                  <span className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/80 opacity-0 shadow-lg transition-opacity group-hover/right:opacity-100">
                    <ChevronRight className="size-6" />
                  </span>
                </button>

                {/* Mobile & visible bottom circular buttons */}
                <button
                  type="button"
                  aria-label="Предыдущий кадр"
                  disabled={
                    !connected ||
                    navigating ||
                    game.stage === 0 ||
                    remaining === 0 ||
                    !!mine?.solved
                  }
                  onClick={() => {
                    playSound('whoosh');
                    navigate(game.stage - 1);
                  }}
                  className="absolute left-2 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/75 text-white shadow-lg hover:bg-black focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-25"
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  aria-label="Следующий кадр"
                  disabled={
                    !connected ||
                    navigating ||
                    game.stage === 4 ||
                    remaining === 0 ||
                    !!mine?.solved
                  }
                  onClick={() => {
                    playSound('whoosh');
                    navigate(game.stage + 1);
                  }}
                  className="absolute right-2 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/75 text-white shadow-lg hover:bg-black focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-25"
                >
                  <ChevronRight />
                </button>
              </>
            )}

            {/* Zoom toggle button in corner */}
            <button
              type="button"
              aria-label={zoomed ? 'Уменьшить' : 'Приблизить'}
              title={zoomed ? 'Уменьшить' : 'Приблизить'}
              onClick={() => setZoomed((z) => !z)}
              className="absolute right-2 top-2 z-30 flex size-8 items-center justify-center rounded-lg border border-white/20 bg-black/70 text-white/80 hover:bg-black hover:text-white transition-colors"
            >
              {zoomed ? (
                <ZoomOut className="size-4" />
              ) : (
                <ZoomIn className="size-4" />
              )}
            </button>
          </div>

          {/* Split-click instruction pill */}
          {game.phase === 'playing' && (
            <div className="flex items-center justify-center">
              <span className="rounded-full border border-white/10 bg-secondary/80 px-3 py-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Нажмите слева / справа для переключения
              </span>
            </div>
          )}

          <div
            className="flex shrink-0 gap-2"
            aria-label={`Открыто ${game.phase === 'playing' ? unlocked + 1 : 5} из 5 подсказок`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= (game.phase === 'playing' ? unlocked : 4) ? 'bg-primary' : 'bg-secondary'}`}
              />
            ))}
          </div>
          {game.phase === 'playing' && (
            <div className="shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-bold text-primary">
                  <Sparkles className="size-3.5" />
                  За ответ: +{game.possibleScore ?? 20} очков
                </span>
                <span className="text-muted-foreground">
                  Кадр {game.stage + 1}/5 · следующий: −5 с, −4 очка
                </span>
              </div>
              {navigation.error && (
                <p role="alert" className="text-sm text-destructive mt-1">
                  {navigation.error.message}
                </p>
              )}
            </div>
          )}
        </div>
        {game.phase === 'playing' ? (
          <AnswerForm
            key={game.roundId}
            game={game}
            personal={personal?.roundId === game.roundId ? personal : null}
            solved={mine?.solved ?? false}
            getSocket={getSocket}
            connected={connected}
            now={now}
          />
        ) : (
          <Card
            className="shrink-0 border-primary/40 bg-primary/5 p-4"
            aria-live="polite"
          >
            <div className="flex items-center gap-4">
              {game.answer?.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.answer.posterUrl}
                  alt={game.answer.name}
                  className="size-20 rounded-xl border border-primary/30 object-cover shadow-md shrink-0"
                />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                  <Film className="size-8 text-primary/60" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-widest text-primary font-bold">
                  Правильный ответ
                </p>
                <h3 className="truncate text-xl font-bold">
                  {game.answer?.name}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({game.answer?.year ?? '—'})
                  </span>
                </h3>
                <p className="mt-0.5 text-sm font-medium">
                  {mine?.roundScore
                    ? `🎉 Ваш результат: +${mine.roundScore} очков`
                    : 'В этом раунде без очков. Следующий раунд — новый шанс!'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {game.roundNumber === game.totalRounds
                    ? 'Финал партии'
                    : `Следующий раунд ${game.roundNumber + 1} из ${game.totalRounds}`}{' '}
                  через {remaining} с
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
      <Card className="game-standings rounded-xl px-3 py-2">
        <h3 className="sr-only">Счёт</h3>
        <ol className="flex gap-4 overflow-x-auto">
          {game.standings.map((p) => (
            <li
              key={p.playerId}
              className="flex shrink-0 items-center justify-between gap-3 text-sm"
            >
              <span>
                <span className="mr-3 text-muted-foreground">
                  {game.standings.findIndex(
                    (other) => other.score === p.score,
                  ) + 1}
                </span>
                {p.nickname}
                {p.playerId === playerId ? ' (вы)' : ''}
                {p.solved && game.phase === 'playing' ? ' · угадал' : ''}
              </span>
              <strong className="tabular-nums">{p.score}</strong>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
function AnswerForm({
  game,
  personal,
  solved,
  getSocket,
  connected,
  now,
}: {
  game: GameSnapshot;
  personal: GamePersonal | null;
  solved: boolean;
  getSocket: () => Socket | null;
  connected: boolean;
  now: number;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<TitleOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expired = now >= game.endsAt;

  useEffect(() => {
    if (!solved && !personal?.solved && !expired) {
      inputRef.current?.focus();
    }
  }, [game.roundId, solved, personal?.solved, expired]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({
    queryKey: ['titles', game.matchId, debounced],
    enabled: connected && !solved && debounced.length >= 2,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const socket = getSocket();
      if (!socket?.connected) throw new Error('Нет соединения.');
      const ack: SearchAck = await socket
        .timeout(5000)
        .emitWithAck('game:search', { query: debounced });
      if (!ack.ok) throw new Error(ack.message);
      return ack.titles;
    },
  });
  const answer = useMutation({
    mutationFn: async (directTitle?: TitleOption) => {
      const socket = getSocket();
      const target = directTitle ?? selected;
      if (!socket?.connected || !target)
        throw new Error('Выберите название и дождитесь соединения.');
      const ack: AnswerAck = await socket
        .timeout(5000)
        .emitWithAck('game:answer', {
          roundId: game.roundId,
          commandId: crypto.randomUUID(),
          titleId: target.id,
        });
      if (!ack.ok) throw new Error(ack.message);
      if (ack.status === 'correct') {
        playSound('correct', `${game.roundId}:correct`);
        playSound('streak');
      } else if (ack.status === 'incorrect') {
        playSound('incorrect');
      }
      return ack;
    },
  });
  const skip = useMutation({
    mutationFn: async () => {
      const socket = getSocket();
      if (!socket?.connected) throw new Error('Нет соединения.');
      playSound('skip');
      const ack: RoomAck = await socket
        .timeout(5000)
        .emitWithAck('game:skip', { roundId: game.roundId });
      if (!ack.ok) throw new Error(ack.message);
    },
  });
  const cooldown = Math.max(
    0,
    Math.ceil(
      ((personal?.nextAllowedAt ?? answer.data?.nextAllowedAt ?? 0) - now) /
        1000,
    ),
  );
  const options =
    !selected &&
    !dismissed &&
    connected &&
    query.trim() === debounced &&
    debounced.length >= 2 &&
    !search.isFetching
      ? (search.data ?? [])
      : [];
  const activeOption = options[active];
  const choose = (title: TitleOption) => {
    setSelected(title);
    setActive(-1);
    setDismissed(true);
    if (
      !cooldown &&
      !expired &&
      connected &&
      !answer.isPending &&
      !skip.isPending
    ) {
      answer.mutate(title);
    }
  };
  if (expired && !solved && !personal?.solved)
    return (
      <Card className="p-6" role="status">
        <h3 className="text-xl font-bold">
          {game.personalSkipped
            ? 'Вы пропустили этот фильм'
            : 'Ваше время вышло'}
        </h3>
        <p className="text-sm text-muted-foreground">
          Остальные ещё угадывают. Итоги появятся, когда все закончат.
        </p>
      </Card>
    );
  if (solved || personal?.solved)
    return (
      <Card className="border-primary/40 p-5" role="status">
        <p className="font-semibold text-primary">Верно! Очки уже ваши.</p>
        <p className="text-sm text-muted-foreground">
          {game.standings.length === 1
            ? 'Показываем ответ и переходим дальше.'
            : 'Остальные ещё играют. Когда все закончат, сразу перейдём дальше.'}
        </p>
      </Card>
    );
  return (
    <form
      id="answer-form"
      className="answer-form relative space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          selected &&
          !cooldown &&
          !expired &&
          connected &&
          !answer.isPending &&
          !skip.isPending
        )
          answer.mutate();
      }}
    >
      <Label className="sr-only" htmlFor="answer-search">
        Как называется это кино?
      </Label>
      <div className="answer-controls flex flex-wrap sm:flex-nowrap gap-2 items-center">
        <Input
          ref={inputRef}
          className="answer-input h-14 rounded-xl text-base px-4 font-medium"
          id="answer-search"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={options.length ? 'answer-options' : undefined}
          aria-activedescendant={
            activeOption ? `answer-option-${activeOption.id}` : undefined
          }
          aria-describedby="answer-help"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') {
              setDismissed(true);
              setActive(-1);
            } else if (
              (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
              options.length
            ) {
              e.preventDefault();
              setActive((current) =>
                e.key === 'ArrowDown'
                  ? (current + 1) % options.length
                  : (current <= 0 ? options.length : current) - 1,
              );
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (activeOption) {
                choose(activeOption);
              } else if (
                selected &&
                !cooldown &&
                !expired &&
                connected &&
                !answer.isPending
              ) {
                answer.mutate();
              }
            }
          }}
          maxLength={80}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setActive(-1);
            setDismissed(false);
            answer.reset();
          }}
          placeholder="Начните вводить название по-русски…"
          disabled={expired}
        />
        <p id="answer-help" className="sr-only">
          Найдите название и кликните по нему для мгновенного ответа. Стрелки —
          выбор, Enter — подтверждение.
        </p>
        {!selected &&
          !dismissed &&
          connected &&
          query.trim() === debounced &&
          debounced.length >= 2 && (
            <div
              className="answer-suggestions absolute inset-x-0 bottom-full z-20 mb-2 rounded-xl border bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
              aria-live="polite"
            >
              {search.isFetching ? (
                <p className="text-sm text-muted-foreground p-2">Ищем…</p>
              ) : search.error ? (
                <p role="alert" className="p-2 text-destructive">
                  Поиск недоступен. Попробуйте ещё раз.
                </p>
              ) : search.data?.length ? (
                <ul
                  className="grid max-h-[min(36dvh,320px)] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3"
                  id="answer-options"
                  role="listbox"
                  aria-label="Результаты поиска"
                >
                  {search.data.map((t, index) => (
                    <li key={t.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        id={`answer-option-${t.id}`}
                        aria-selected={index === active}
                        className="aria-selected:bg-primary/20 flex h-full w-full items-center gap-3 rounded-xl border p-2 text-left hover:border-primary hover:bg-secondary focus-visible:bg-secondary transition-colors"
                        onClick={() => choose(t)}
                      >
                        <Poster url={t.posterUrl} />
                        <span className="flex-1 text-sm font-medium leading-snug">
                          {t.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.year ?? '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground p-2">
                  Такое название пока не найдено в этой подборке.
                </p>
              )}
            </div>
          )}
        <Button
          type="submit"
          className="h-14 px-6 text-base font-bold shrink-0"
          disabled={
            !selected ||
            !!cooldown ||
            expired ||
            !connected ||
            answer.isPending ||
            skip.isPending
          }
        >
          {!connected
            ? 'Восстанавливаем связь…'
            : expired
              ? 'Время вышло'
              : cooldown
                ? `Пауза ${cooldown} с`
                : answer.isPending
                  ? 'Проверяем…'
                  : selected
                    ? 'Отправить ответ →'
                    : 'Ответить'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 px-5 text-sm shrink-0"
          disabled={!connected || expired || answer.isPending || skip.isPending}
          onClick={() => skip.mutate()}
        >
          {skip.isPending ? 'Пропускаем…' : 'Не знаю'}
        </Button>
      </div>
      <div className="min-h-[22px] flex items-center">
        {selected ? (
          <p className="truncate text-xs text-muted-foreground">
            Выбран фильм:{' '}
            <strong className="text-foreground">{selected.name}</strong> ·{' '}
            {selected.year ?? '—'}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">
            💡 Начните вводить название и кликните по подсказке для мгновенного
            ответа
          </p>
        )}
      </div>
      {skip.error && (
        <p role="alert" className="text-sm text-destructive">
          {skip.error.message}
        </p>
      )}
      <p role="status" className="empty:hidden text-xs text-muted-foreground">
        {answer.error
          ? 'Не удалось отправить ответ. Проверьте связь и повторите.'
          : answer.data?.status === 'incorrect'
            ? 'Пока нет. Можно попробовать другое название.'
            : answer.data?.status === 'finished'
              ? 'Ответ пришёл после окончания раунда.'
              : ''}
      </p>
    </form>
  );
}

function Poster({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={44}
      height={66}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-16 w-11 shrink-0 rounded-md object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
    >
      ▶
    </span>
  );
}

function FinishedGameScreen({
  game,
  playerId,
  leave,
  restart,
  restarting,
  isHost,
  format,
  onOpenLobby,
}: {
  game: GameSnapshot;
  playerId: string;
  leave: () => void;
  restart?: () => void;
  restarting?: boolean;
  isHost?: boolean;
  format?: 'party' | 'solo' | 'battle';
  onOpenLobby?: () => void;
}) {
  const mine = game.standings.find((p) => p.playerId === playerId);
  const myScore = mine?.score ?? 0;
  const maxPossible = (game.totalRounds || 1) * 20;
  const percentage = Math.round((myScore / maxPossible) * 100);

  let rankTitle = 'Зритель премьеры';
  let rankSubtitle =
    'Хорошая тренировка! В следующей партии результат будет ещё лучше.';
  let rankBadge = '🍿 Киноман';
  if (percentage >= 80) {
    rankTitle = 'Великий синефил';
    rankSubtitle =
      'Вы феноменально знаете кино! Почти каждый кадр взят с первой подсказки.';
    rankBadge = '🏆 Легенда';
  } else if (percentage >= 50) {
    rankTitle = 'Опытный киноман';
    rankSubtitle =
      'Отличная эрудиция! Вы легко узнаёте культовые сцены и шедевры.';
    rankBadge = '🎬 Знаток';
  } else if (percentage >= 25) {
    rankTitle = 'Любитель кино';
    rankSubtitle = 'Хороший темп, большинство подсказок сработали верно.';
    rankBadge = '🍿 Любитель';
  }

  const sorted = [...game.standings].sort((a, b) => b.score - a.score);
  const myRank = sorted.findIndex((p) => p.playerId === playerId) + 1;

  const [copied, setCopied] = useState(false);
  const handleShare = async () => {
    try {
      const shareText = `Кадрово 🎬: набрал ${myScore} из ${maxPossible} очков (${percentage}%) в ${game.totalRounds} раундах! Звание: ${rankTitle}. Попробуй обогнать: ${typeof window !== 'undefined' ? window.location.origin : ''}`;
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" /> ФИНАЛ МАТЧА
          </span>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-white">
            {format === 'party' && sorted.length > 1
              ? myRank === 1
                ? '🏆 Победа в кинозале!'
                : `Игра завершена · ${myRank} место`
              : `${rankBadge} · ${rankTitle}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{rankSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={leave}
            className="rounded-2xl border-border/70 bg-secondary text-white hover:bg-zinc-800"
          >
            <LogOut className="size-4 mr-2" />
            Выйти
          </Button>
        </div>
      </div>

      {/* Main 2-Column Content Layout (Desktop) / 1-Column (Mobile) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Player Score Card & Actions (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-3xl border border-border/70 bg-card p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  Итоговый счёт
                </span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                  {modeLabels[game.mode]} · {game.totalRounds} раундов
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-7xl sm:text-8xl font-black tabular-nums text-primary tracking-tight">
                  {myScore}
                </span>
                <span className="text-xl text-muted-foreground font-semibold">
                  / {maxPossible} очков
                </span>
              </div>

              {/* Accuracy progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">
                    Результативность
                  </span>
                  <span className="text-primary font-bold">{percentage}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{
                      width: `${Math.max(4, Math.min(100, percentage))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Stats badges */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="rounded-2xl border border-border/50 bg-secondary/60 p-3 text-center">
                  <span className="text-xs text-muted-foreground block">
                    Раундов
                  </span>
                  <span className="text-lg font-black text-white">
                    {game.totalRounds}
                  </span>
                </div>
                <div className="rounded-2xl border border-border/50 bg-secondary/60 p-3 text-center">
                  <span className="text-xs text-muted-foreground block">
                    Механика
                  </span>
                  <span className="text-sm font-bold text-white mt-0.5 block truncate">
                    {modeLabels[game.mode]}
                  </span>
                </div>
                <div className="rounded-2xl border border-border/50 bg-secondary/60 p-3 text-center">
                  <span className="text-xs text-muted-foreground block">
                    Ср. за фильм
                  </span>
                  <span className="text-lg font-black text-primary">
                    {(myScore / (game.totalRounds || 1)).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* CTA action buttons */}
            <div className="pt-8 space-y-3">
              {restart && (isHost || format === 'solo') ? (
                <Button
                  size="lg"
                  onClick={restart}
                  disabled={restarting}
                  className="w-full h-14 rounded-2xl bg-primary text-white font-black text-base shadow-xl shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  {restarting ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Запускаем…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RotateCcw className="size-5" />
                      {format === 'solo'
                        ? 'Играть ещё раз'
                        : 'Запустить реванш'}
                    </span>
                  )}
                </Button>
              ) : format === 'party' && !isHost ? (
                <div className="rounded-2xl border border-border/60 bg-secondary/70 p-4 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Ожидаем, пока организатор запустит реванш…
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={handleShare}
                  className="h-12 rounded-2xl border-border/70 bg-secondary text-sm font-semibold hover:bg-zinc-800 text-white"
                >
                  <Share2 className="size-4 mr-2" />
                  {copied ? '✓ Скопировано!' : 'Поделиться'}
                </Button>

                {onOpenLobby ? (
                  <Button
                    variant="outline"
                    onClick={onOpenLobby}
                    className="h-12 rounded-2xl border-border/70 bg-secondary text-sm font-semibold hover:bg-zinc-800 text-white"
                  >
                    <Settings2 className="size-4 mr-2" />
                    Настройки
                  </Button>
                ) : (
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center h-12 rounded-2xl border border-border/70 bg-secondary text-sm font-semibold hover:bg-zinc-800 text-white"
                  >
                    В главное меню
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Featured Movie & Leaderboard (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Last Movie Reveal Card */}
          {game.answer && (
            <div className="rounded-3xl border border-border/70 bg-card p-6 space-y-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                {game.totalRounds === 1
                  ? 'Загаданный фильм'
                  : 'Финальный фильм раунда'}
              </p>
              <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-secondary/60 p-4">
                {game.answer.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.answer.posterUrl}
                    alt={game.answer.name}
                    className="w-20 h-28 rounded-xl object-cover border border-border/60 shadow-lg shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 rounded-xl bg-secondary flex items-center justify-center border border-border/60 shrink-0">
                    <Film className="size-8 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                    {categoryLabels[game.answer.category]}
                  </span>
                  <h3 className="mt-1 text-lg font-black text-white truncate">
                    {game.answer.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {game.answer.year ?? '—'}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-foreground">
                    {mine?.roundScore
                      ? `✓ Угадано: +${mine.roundScore} очков`
                      : '— Фильм не был угадан'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Standings / Leaderboard */}
          <div className="rounded-3xl border border-border/70 bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                {sorted.length > 1
                  ? 'Итоговый зачёт кинозала'
                  : 'Участник игры'}
              </p>
              <span className="text-xs text-muted-foreground">
                {sorted.length} чел.
              </span>
            </div>
            <div className="space-y-2">
              {sorted.map((p, idx) => {
                const isMe = p.playerId === playerId;
                const medals = ['🥇', '🥈', '🥉'];
                const medal = medals[idx];
                return (
                  <div
                    key={p.playerId}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all ${
                      idx === 0 && sorted.length > 1
                        ? 'border-primary/50 bg-secondary ring-1 ring-primary/30'
                        : isMe
                          ? 'border-border/80 bg-secondary'
                          : 'border-border/40 bg-secondary/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-7 items-center justify-center font-bold text-sm">
                        {medal ?? (
                          <span className="text-muted-foreground text-xs font-semibold">
                            #{idx + 1}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                          {p.nickname}
                          {isMe && (
                            <span className="rounded-md bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                              ВЫ
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black tabular-nums text-white">
                        {p.score}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        очков
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
