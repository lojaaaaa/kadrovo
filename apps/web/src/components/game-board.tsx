'use client';
import { GameStandings } from './game-standings';
import { AnswerForm } from './game-answer';
import { PosterImage } from './poster-image';
import { roundClock } from '@/lib/round-clock';
import { GameReview } from './game-review';
import { FrameReport } from './frame-report';
import { FramePlayer } from './frame-player';
import { HelpTip } from './ui/help-tip';
import { LogOut, Film, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sound';
import { useMutation } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  modeLabels,
  type RoomSession,
  type RoomSnapshot,
  type GameSnapshot,
  type GamePersonal,
  type RoomAck,
} from '@filmless/contracts';
import { Button } from './ui/button';
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
  const loadedFrame = useRef<string | null>(null);
  const [clock, setClock] = useState({ anchor: receivedAt, elapsed: 0 });
  useEffect(() => {
    const update = () =>
      setClock((previous) => {
        const elapsed =
          Math.floor(Math.max(0, performance.now() - receivedAt) / 1000) * 1000;
        return previous.anchor === receivedAt && previous.elapsed === elapsed
          ? previous
          : { anchor: receivedAt, elapsed };
      });
    if (game.phase === 'finished') return;
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [receivedAt, game.phase]);
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
      if (
        stage > (game.unlockedStage ?? 0) &&
        loadedFrame.current !== game.image
      )
        throw new Error('Дождитесь загрузки текущего кадра.');
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
  const onFrameLoaded = useCallback((src: string) => {
    loadedFrame.current = src;
  }, []);
  const navigateFrame = useCallback(
    (stage: number) => {
      playSound('whoosh');
      navigate(stage);
    },
    [navigate],
  );
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
      className={`game-board ${game.standings.length === 1 ? 'game-solo' : ''} ${game.mode === 'spotlight' || game.mode === 'pixels' ? 'game-spotlight' : ''} rounded-2xl border border-border/70 surface-panel bg-card p-3 sm:p-4 game-viewport`}
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
            {clockDisplay.label !== 'с' && (
              <span className="game-timer-label">{clockDisplay.label}</span>
            )}
          </p>
        </div>
      </div>
      <div className="gameplay-layout">
        <div className="game-image-group">
          <FramePlayer
            game={game}
            onLoaded={onFrameLoaded}
            disabled={
              spectator ||
              !connected ||
              navigating ||
              remaining === 0 ||
              !!mine?.solved ||
              !!mine?.wrong ||
              !!game.personalSkipped
            }
            navigate={navigateFrame}
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
                <PosterImage
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
      <GameStandings game={game} playerId={playerId} now={now} />
    </section>
  );
}
