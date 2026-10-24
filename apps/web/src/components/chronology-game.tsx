'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import type { ChronologySnapshot } from '@filmless/contracts';
import { api } from '@/lib/account';
import { m } from './motion-system';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { PosterImage } from './poster-image';
function Poster({ url }: { url?: string }) {
  return (
    <PosterImage
      src={url}
      className="chronology-poster"
      sizes="(max-width:640px) 40vw, 200px"
      loading="eager"
    />
  );
}
export function ChronologyGame() {
  const [game, setGame] = useState<ChronologySnapshot | null>(null),
    reduced = useReducedMotion();
  const [restoring, setRestoring] = useState(true);
  const pendingAnswer = useRef<{
    pairId: string;
    commandId: string;
    choice: 'earlier' | 'later';
  } | null>(null);
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const id = sessionStorage.getItem('kadrovo:chronology');
        if (id) {
          const value = await api<ChronologySnapshot>('chronology', 'POST', {
            action: 'resume',
            sessionId: id,
          });
          if (active) setGame(value);
        }
      } catch {
        try {
          sessionStorage.removeItem('kadrovo:chronology');
        } catch {
          /* Storage can be unavailable in private browsing. */
        }
      } finally {
        if (active) setRestoring(false);
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, []);
  const action = useMutation({
    mutationFn: (body: unknown) =>
      api<ChronologySnapshot>('chronology', 'POST', body),
    retry: 1,
    onSuccess: (value) => {
      setGame(value);
      try {
        sessionStorage.setItem('kadrovo:chronology', value.sessionId);
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    },
  });
  const start = () =>
    action.mutate({ action: 'start', commandId: crypto.randomUUID() });
  const choose = (choice: 'earlier' | 'later') => {
    if (!game || game.phase !== 'answer') return;
    if (pendingAnswer.current?.pairId !== game.pairId)
      pendingAnswer.current = {
        pairId: game.pairId,
        commandId: crypto.randomUUID(),
        choice,
      };
    action.mutate({
      action: 'answer',
      sessionId: game.sessionId,
      ...pendingAnswer.current,
    });
  };
  return (
    <section className="chronology-game">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <Link
          href="/play/solo"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Соло
        </Link>
        <span className="text-sm tabular-nums">
          {game
            ? `${game.round} / ${game.total} · Верно: ${game.score}`
            : '10 пар · без таймера'}
        </span>
      </div>
      <h1 className="text-2xl font-bold">Раньше или позже</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Второй фильм вышел раньше или позже первого?
      </p>
      {restoring ? (
        <Skeleton
          className="mt-6 h-72 w-full"
          aria-label="Восстановление игры"
        />
      ) : !game ? (
        <div className="chronology-start">
          <div className="chronology-preview" aria-hidden>
            <span>1999</span>
            <ArrowRight />
            <span>?</span>
          </div>
          <Button onClick={start} disabled={action.isPending}>
            {action.isPending ? 'Открываем…' : 'Играть'}
          </Button>
        </div>
      ) : (
        <>
          <div className="chronology-pair">
            {[game.anchor, game.challenger].map((film, i) => (
              <m.article
                key={`${game.pairId}:${i}`}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="chronology-film"
              >
                <Poster key={film.posterUrl} url={film.posterUrl} />
                <div>
                  <h2>{film.name}</h2>
                  <strong
                    className={
                      i === 1 && game.result
                        ? game.result.correct
                          ? 'text-primary'
                          : 'text-destructive'
                        : ''
                    }
                  >
                    {film.year ?? '?'}
                  </strong>
                </div>
              </m.article>
            ))}
          </div>
          <div className="chronology-actions">
            {game.phase === 'answer' ? (
              <>
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => choose('earlier')}
                >
                  <ArrowLeft />
                  Раньше {game.anchor.year}
                </Button>
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => choose('later')}
                >
                  Позже {game.anchor.year}
                  <ArrowRight />
                </Button>
              </>
            ) : (
              <>
                <p role="status" className="inline-flex items-center gap-2">
                  {game.result?.correct ? (
                    <Check className="text-primary" />
                  ) : (
                    <X className="text-destructive" />
                  )}
                  {game.result?.correct
                    ? 'Верно'
                    : `Фильм вышел ${game.result?.answer === 'earlier' ? 'раньше' : 'позже'}`}
                </p>
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    game.phase === 'finished'
                      ? start()
                      : action.mutate({
                          action: 'next',
                          sessionId: game.sessionId,
                          pairId: game.pairId,
                        })
                  }
                >
                  {game.phase === 'finished' ? (
                    <>
                      <RotateCcw />
                      Ещё партия
                    </>
                  ) : (
                    <>
                      Следующая пара
                      <ArrowRight />
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
          {game.phase === 'finished' && (
            <p className="text-center mt-4 text-muted-foreground">
              Угадано {game.score} из {game.total}. Результат не влияет на
              рейтинг.
            </p>
          )}
        </>
      )}
      {action.error && (
        <p role="alert" className="text-destructive mt-4">
          {action.error.message}
          <Button variant="ghost" onClick={start}>
            Начать заново
          </Button>
        </p>
      )}
    </section>
  );
}
