'use client';
import { roundClock } from '@/lib/round-clock';
import { GameReview } from './game-review';
import { FrameReport } from './frame-report';
import { FramePlayer } from './frame-player';
import { HelpTip } from './ui/help-tip';
import { m } from './motion-system';
import { LogOut, Film, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sound';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  modeLabels,
  type RoomSession,
  type RoomSnapshot,
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
  room,
  session,
  rematch,
  onOpenLobby,
}: {
  room: RoomSnapshot;
  session: RoomSession;
  rematch: () => void;
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
  const clockDisplay = roundClock({
    phase: game.phase,
    seconds: remaining,
    solved: mine?.solved,
    skipped: game.personalSkipped || mine?.skipped,
    wrong: game.personalWrong,
  });
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
        (room.sharedAnswer && room.hostId !== playerId) ||
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
    room.sharedAnswer,
    room.hostId,
    playerId,
  ]);
  if (game.phase === 'finished')
    return (
      <GameReview
        game={game}
        playerId={playerId}
        room={room}
        session={session}
        leave={leave}
        restart={restart}
        restarting={restarting}
        rematch={rematch}
        onOpenLobby={onOpenLobby}
      />
    );
  const spectator = !!room.sharedAnswer && room.hostId !== playerId;

  return (
    <section
      className={`game-board ${game.standings.length === 1 ? 'game-solo' : ''} ${game.mode === 'spotlight' ? 'game-spotlight' : ''} rounded-2xl border border-border/70 surface-panel bg-card p-3 sm:p-4 game-viewport`}
      aria-label="Партия"
    >
      <div className="game-topbar flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Раунд {game.roundNumber} из {game.totalRounds}
          </p>
          {game.standings.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Счёт: <strong className="text-primary">{mine?.score ?? 0}</strong>
            </p>
          )}
          <h2 className="mt-0.5 text-lg font-bold text-white">
            {modeLabels[game.mode]}
          </h2>
        </div>
        <div className="game-topbar-actions flex shrink-0 items-center gap-3">
          <Button
            aria-label="Выйти из комнаты"
            title="Выйти из комнаты"
            variant="outline"
            onClick={leave}
            className="h-11 border-border/70 text-muted-foreground hover:text-white"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Выйти</span>
          </Button>
          <p
            className={`game-timer rounded-2xl border-2 border-current/20 px-5 py-3 text-4xl sm:text-5xl font-black tabular-nums ${
              clockDisplay.urgent
                ? 'bg-destructive/20 text-destructive'
                : 'bg-secondary text-white'
            }`}
            aria-label={`${clockDisplay.value} ${clockDisplay.label}`}
          >
            <span className="game-timer-value">{clockDisplay.value}</span>
            <span className="game-timer-label">{clockDisplay.label}</span>
          </p>
        </div>
      </div>
      <div className="gameplay-layout">
        <div className="game-image-group">
          <FramePlayer
            game={game}
            disabled={
              spectator ||
              !connected ||
              navigating ||
              remaining === 0 ||
              !!mine?.solved ||
              !!mine?.wrong ||
              !!game.personalSkipped
            }
            navigate={(stage) => {
              playSound('whoosh');
              navigate(stage);
            }}
          />
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
                  {mine?.wrong
                    ? 'Штраф: '
                    : mine?.solved
                      ? 'Заработано: +'
                      : game.personalSkipped ||
                          game.personalExpired ||
                          remaining === 0
                        ? 'Результат: '
                        : 'За ответ: +'}
                  {mine?.wrong
                    ? -4
                    : mine?.solved
                      ? mine.roundScore
                      : game.personalSkipped ||
                          game.personalExpired ||
                          remaining === 0
                        ? 0
                        : Math.max(
                            1,
                            Math.min(
                              (game.possibleScore ?? 20) -
                                game.standings.filter((p) => p.solved).length *
                                  2,
                              ...game.standings
                                .filter((p) => p.solved)
                                .map((p) => p.roundScore - 2),
                            ),
                          )}{' '}
                  очков
                </span>
                <span className="frame-position">
                  <span>
                    Кадр <strong>{game.stage + 1} / 5</strong>
                  </span>
                  <HelpTip label="Правила подсказок">
                    Новый кадр: −5 секунд и −4 очка. Возврат к открытым кадрам —
                    бесплатно. Клавиши ← и → переключают кадры.
                  </HelpTip>
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
        {game.phase === 'playing' && spectator ? (
          <Card role="status" className="p-4">
            Обсуждайте фильм вместе. Ответ и подсказки выбирает ведущий.
          </Card>
        ) : game.phase === 'playing' ? (
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
                    ? `Ваш результат: ${mine.roundScore > 0 ? '+' : ''}${mine.roundScore} очков`
                    : 'Раунд завершён без очков.'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {game.roundNumber === game.totalRounds
                    ? 'Показываем результаты…'
                    : 'Следующий раунд…'}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
      <FrameReport key={`${game.roundId}:${game.stage}`} session={session} />
      {game.standings.length > 1 && (
        <Card className="game-standings rounded-xl px-3 py-2">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {game.standings.length === 1 ? 'Ваш счёт' : 'Игроки · время · очки'}
          </h3>
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {game.standings.map((p) => (
              <m.li
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                key={p.playerId}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 p-2 text-sm"
              >
                <span>
                  <span className="mr-3 text-muted-foreground">
                    {game.standings.findIndex(
                      (other) => other.score === p.score,
                    ) + 1}
                  </span>
                  {p.nickname}
                  {p.playerId === playerId ? ' (вы)' : ''}
                  {p.solved && game.phase === 'playing'
                    ? ` · угадал #${p.finishOrder ?? ''}`
                    : ''}
                  {game.phase === 'playing' && (
                    <span className="mt-1 block text-xs font-semibold tabular-nums text-primary">
                      {p.solved
                        ? '✓ Готов'
                        : p.wrong
                          ? 'Неверный ответ · −4'
                          : p.skipped
                            ? 'Пропустил'
                            : p.expired || (p.deadline ?? game.endsAt) <= now
                              ? 'Время вышло'
                              : `${Math.max(0, Math.ceil(((p.deadline ?? game.endsAt) - now) / 1000))} с · угадывает`}
                    </span>
                  )}
                </span>
                <m.strong
                  key={p.score}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  className="text-xl tabular-nums text-primary"
                >
                  {p.score}
                  <span className="ml-1 text-xs text-muted-foreground">
                    оч.
                  </span>
                </m.strong>
              </m.li>
            ))}
          </ol>
        </Card>
      )}
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
    if (
      !solved &&
      !personal?.solved &&
      !expired &&
      window.matchMedia('(pointer: fine)').matches
    ) {
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        game.answerMode !== 'choices' ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.isComposing ||
        !(e.key >= '1' && e.key <= '4') ||
        solved ||
        expired ||
        game.personalWrong ||
        answer.isPending ||
        skip.isPending ||
        !connected
      )
        return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input,textarea,select,[contenteditable=true]')
      )
        return;
      const title = game.choices?.[Number(e.key) - 1];
      if (title) {
        e.preventDefault();
        answer.mutate(title);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [game, solved, expired, answer, skip.isPending, connected]);
  if (
    game.answerMode === 'choices' &&
    (game.personalWrong || answer.data?.status === 'incorrect')
  )
    return (
      <Card role="status" className="border-destructive/30 p-4">
        <p className="font-semibold text-destructive">
          Неверный ответ · −4 очка
        </p>
        <p className="text-sm text-muted-foreground">
          Попытка завершена. Остальные ещё отвечают.
        </p>
      </Card>
    );
  if (expired && !solved && !personal?.solved)
    return (
      <Card className="p-6" role="status">
        <h3 className="text-xl font-bold">
          {game.personalSkipped
            ? 'Вы пропустили этот фильм'
            : 'Ваше время вышло'}
        </h3>
        <p className="text-sm text-muted-foreground">
          Остальные ещё угадывают. Следите за их временем в таблице — следующий
          раунд начнётся, когда все закончат.
        </p>
      </Card>
    );
  if (solved || personal?.solved)
    return (
      <Card className="border-primary/40 p-5" role="status">
        <p className="font-semibold text-primary">Правильный ответ</p>
        <p className="text-sm text-muted-foreground">
          {game.standings.length === 1
            ? 'Показываем ответ и переходим дальше.'
            : 'Остальные ещё играют. Когда все закончат, сразу перейдём дальше.'}
        </p>
      </Card>
    );
  if (game.answerMode === 'choices')
    return (
      <div className="answer-form space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {game.choices?.map((title, index) => (
            <Button
              key={title.id}
              className="h-auto min-h-12 justify-start whitespace-normal text-left"
              variant="outline"
              disabled={
                !connected ||
                !!cooldown ||
                answer.isPending ||
                skip.isPending ||
                game.personalWrong ||
                answer.data?.status === 'incorrect'
              }
              onClick={() => answer.mutate(title)}
            >
              <span className="mr-2 text-muted-foreground">{index + 1}.</span>
              {title.name} ({title.year})
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {cooldown
              ? `Следующая попытка через ${cooldown} с`
              : answer.data?.status === 'incorrect'
                ? 'Неверный ответ · −4 очка'
                : 'Одна попытка · ошибка −4 очка'}
          </p>
          <Button
            variant="ghost"
            disabled={skip.isPending || !connected}
            onClick={() => skip.mutate()}
          >
            Не знаю
          </Button>
        </div>
        {answer.error && (
          <p role="alert" className="text-destructive">
            {answer.error.message}
          </p>
        )}
      </div>
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
        <div className="answer-input answer-input-wrap">
          <Input
            ref={inputRef}
            className="h-14 rounded-xl text-base pl-4 pr-12 font-medium"
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
            placeholder="Название фильма"
            disabled={expired}
          />
          <HelpTip label="Как ответить">
            Введите название по-русски и выберите фильм из списка — ответ
            отправится сразу. ↑ и ↓ — выбор, Enter — ответ.
          </HelpTip>
        </div>
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
      {selected && (
        <p className="truncate text-xs text-muted-foreground">
          {selected.name} · {selected.year ?? '—'}
        </p>
      )}
      {skip.error && (
        <p role="alert" className="text-sm text-destructive">
          {skip.error.message}
        </p>
      )}
      <p role="status" className="empty:hidden text-xs text-muted-foreground">
        {answer.error
          ? 'Не удалось отправить ответ. Проверьте связь и повторите.'
          : answer.data?.status === 'incorrect'
            ? 'Неверный ответ. Попробуйте другое название.'
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
