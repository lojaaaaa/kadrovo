'use client';
import { PosterImage } from './poster-image';
import { ResultShare } from './result-share';
import { m } from './motion-system';
import { useReducedMotion } from 'motion/react';
import { ConnectionQuiz } from './connection-quiz';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  RotateCcw,
  Users,
} from 'lucide-react';
import type {
  GameSnapshot,
  RoomSession,
  RoomSnapshot,
  TitleOption,
} from '@filmless/contracts';
import { api } from '@/lib/account';
import { Button } from './ui/button';
export function GameReview({
  game,
  playerId,
  leave,
  restart,
  restarting,
  room,
  session,
  rematch,
  onOpenLobby,
}: {
  game: GameSnapshot;
  playerId: string;
  leave: () => void;
  restart?: () => void;
  restarting?: boolean;
  room: RoomSnapshot;
  session: RoomSession;
  rematch: () => void;
  onOpenLobby?: () => void;
}) {
  const reduced = useReducedMotion();
  const history = game.history ?? [];
  const score = game.standings.find((p) => p.playerId === playerId)?.score ?? 0;
  const [saved, setSaved] = useState<string[]>([]);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const watch = useMutation({
    mutationFn: (title: TitleOption) =>
      api('experience/watchlist', 'POST', { titleId: title.id }),
    onSuccess: (_, title) => setSaved((v) => [...v, title.id]),
  });
  const challenge = useMutation({
    mutationFn: () =>
      api<{ id: string }>('experience/challenge', 'POST', {
        code: session.code,
        token: session.token,
      }),
    onSuccess: async (value) => {
      try {
        await navigator.clipboard.writeText(
          `${location.origin}/challenge/${value.id}`,
        );
        setChallengeCopied(true);
      } catch {
        // The visible link remains usable when clipboard permission is unavailable.
        setChallengeCopied(false);
      }
    },
  });
  const solved = history.filter((r) => r.solved).length;
  if (game.termination?.reason === 'aborted')
    return (
      <section
        className="review-screen rounded-2xl border bg-card p-6 sm:p-8"
        role="status"
      >
        <h1 className="text-2xl font-bold">Партия прервана</h1>
        <p className="mt-3 text-muted-foreground">
          Игрок вышел в первом раунде при нулевом счёте. Результат не засчитан,
          рейтинг не изменился.
        </p>
        <Button className="mt-6" onClick={leave}>
          Выйти
        </Button>
      </section>
    );
  const forfeited = game.termination?.reason === 'forfeit';
  return (
    <section className="review-screen space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {room.dailyDay
              ? 'Фильм дня · ' + room.dailyDay
              : room.practiceDay
                ? 'Тренировка · ' + room.practiceDay
                : 'Игра завершена'}
          </p>
          <h1 className="text-3xl font-bold mt-2">
            {forfeited
              ? game.termination?.winnerId === playerId
                ? 'Победа'
                : 'Поражение'
              : `${score} очков`}
          </h1>
          {forfeited && (
            <p className="mt-2 text-muted-foreground">
              {game.termination?.winnerId === playerId
                ? 'Соперник покинул игру. Вам засчитана победа.'
                : 'Вы покинули игру. Засчитано поражение.'}
            </p>
          )}
          <p className="mt-2 text-muted-foreground">
            Угадано {solved} из {history.length}
          </p>
        </div>
        <Button variant="outline" onClick={leave}>
          Выйти
        </Button>
      </header>
      <div className="flex flex-wrap gap-2">
        {onOpenLobby && (
          <Button variant="outline" onClick={onOpenLobby}>
            Настройки лобби
          </Button>
        )}
        {!room.dailyDay &&
          !room.challengeId &&
          (room.format === 'solo' ? (
            <Button onClick={restart} disabled={restarting}>
              <RotateCcw /> Ещё {game.totalRounds} фильмов
            </Button>
          ) : (
            <Button
              onClick={rematch}
              disabled={
                restarting ||
                room.players.filter((p) => p.connected).length <
                  (room.minimumPlayers ?? 2) ||
                room.rematchVotes?.includes(playerId)
              }
            >
              <Users />
              {room.rematchVotes?.includes(playerId)
                ? 'Ждём остальных'
                : 'Реванш'}{' '}
              · {room.rematchVotes?.length ?? 0}/{room.players.length}
            </Button>
          ))}
        {room.format !== 'solo' &&
          room.players.filter((p) => p.connected).length <
            (room.minimumPlayers ?? 2) && (
            <p
              role="status"
              className="self-center text-sm text-muted-foreground"
            >
              Недостаточно игроков для новой игры · нужно{' '}
              {room.minimumPlayers ?? 2}
            </p>
          )}
        <ResultShare history={history} score={score} day={room.dailyDay} />
        {!game.demo && !room.dailyDay && (
          <Button
            variant="outline"
            onClick={() => challenge.mutate()}
            disabled={challenge.isPending}
          >
            <ArrowRight />
            Вызвать друга
          </Button>
        )}
        <Link
          className="inline-flex items-center text-sm text-primary px-3"
          href="/profile"
        >
          Мои фильмы
        </Link>
      </div>
      {challenge.data && (
        <div className="rounded-xl border p-3">
          <p className="text-sm mb-2">
            {challengeCopied ? 'Ссылка скопирована. ' : ''}Одинаковые фильмы и
            правила. Сохраняется первый результат.
          </p>
          <Link
            className="text-primary break-all"
            href={'/challenge/' + challenge.data.id}
          >
            {typeof location !== 'undefined' ? location.origin : ''}/challenge/
            {challenge.data.id}
          </Link>
        </div>
      )}
      {(watch.error || challenge.error) && (
        <p role="alert" className="text-destructive">
          {watch.error?.message ?? challenge.error?.message}
        </p>
      )}
      {room.challengeId && (
        <Link
          className="block text-primary"
          href={'/challenge/' + room.challengeId}
        >
          Сравнить результаты вызова →
        </Link>
      )}
      {room.format !== 'solo' && (
        <ol className="review-standings">
          {game.standings.map((p, i) => (
            <li key={p.playerId}>
              <span>
                {i + 1}. {p.nickname}
              </span>
              <strong>{p.score}</strong>
            </li>
          ))}
        </ol>
      )}
      <ConnectionQuiz key={game.matchId} history={history} />
      <div className="review-films">
        {history.map((r, i) => (
          <m.article
            key={i}
            className="review-film"
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0 : 0.25,
              delay: reduced ? 0 : Math.min(i, 5) * 0.045,
            }}
          >
            {r.title.posterUrl && <PosterImage src={r.title.posterUrl} />}
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{r.title.name}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {r.title.year} · {r.solved ? 'Угадано' : 'Не угадано'} ·{' '}
                {r.score > 0 ? '+' : ''}
                {r.score} очков
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {r.hints === 0
                  ? 'Без дополнительных подсказок'
                  : `Подсказок: ${r.hints}`}
              </p>
            </div>
            {!game.demo && (
              <Button
                variant="ghost"
                size="sm"
                disabled={saved.includes(r.title.id) || watch.isPending}
                aria-label={'Посмотреть позже: ' + r.title.name}
                onClick={() => watch.mutate(r.title)}
              >
                {saved.includes(r.title.id) ? <Check /> : <BookmarkPlus />}
              </Button>
            )}
          </m.article>
        ))}
      </div>
      {room.dailyDay && (
        <p className="text-sm text-muted-foreground">
          Результат сохранён. Новое задание — в полночь по Москве.
        </p>
      )}
    </section>
  );
}
