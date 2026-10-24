'use client';
/* eslint-disable @next/next/no-img-element -- Authorized game rasters and private media use the same origin cache. */
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { m } from './motion-system';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { rememberRoundImage } from '@/lib/round-images';
import type { GameSnapshot } from '@filmless/contracts';

type Shot = {
  src: string;
  stage: number;
  round: string;
  direction?: number;
  wipe?: boolean;
};
/** Only images authorized by the server enter this cache. No future hint preloads. */
export const FramePlayer = memo(
  function FramePlayer({
    game,
    disabled,
    navigate,
    onLoaded,
  }: {
    game: GameSnapshot;
    disabled: boolean;
    navigate: (stage: number) => void;
    onLoaded: (src: string) => void;
  }) {
    const reduced = useReducedMotion();
    const loadedKeys = useRef(new Set<string>());
    const [shown, setShown] = useState<Shot | null>(null);
    const [failedKey, setFailedKey] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [cache, setCache] = useState(new Map<string, Shot>());
    const imageKey = `${game.roundId}:${game.stage}`;
    const cached = cache.get(imageKey);
    const ready = cached?.src === game.image ? cached : null;
    const failed = failedKey === imageKey;
    useEffect(() => {
      if (ready) return;
      let active = true;
      const image = new Image();
      image.onload = async () => {
        await image.decode().catch(() => undefined);
        if (!active) return;
        const shot = {
          src: game.image,
          stage: game.stage,
          round: game.roundId,
        };
        setCache((previous) =>
          rememberRoundImage(previous, `${game.roundId}:${game.stage}`, shot),
        );
        const isNew = !loadedKeys.current.has(`${game.roundId}:${game.stage}`);
        loadedKeys.current.add(`${game.roundId}:${game.stage}`);
        if (loadedKeys.current.size > 50)
          loadedKeys.current = new Set([`${game.roundId}:${game.stage}`]);
        setShown((previous) => ({
          ...shot,
          direction:
            previous?.round === game.roundId && previous.stage > game.stage
              ? -1
              : 1,
          wipe:
            isNew &&
            previous?.round === game.roundId &&
            game.stage > previous.stage &&
            game.stage === (game.unlockedStage ?? 0) &&
            window.matchMedia('(min-width:900px)').matches,
        }));
        setFailedKey(null);
      };
      image.onerror = () => {
        if (active) setFailedKey(imageKey);
      };
      image.src = game.image;
      return () => {
        active = false;
      };
    }, [
      game.image,
      game.stage,
      game.roundId,
      game.unlockedStage,
      retry,
      ready,
      imageKey,
    ]);
    const current = !!ready || shown?.src === game.image;
    const visible =
      shown?.round === game.roundId && shown.src === game.image
        ? shown
        : (ready ?? (shown?.round === game.roundId ? shown : null));
    useEffect(() => {
      if (current) onLoaded(game.image);
    }, [current, game.image, onLoaded]);
    const unlocked = game.unlockedStage ?? 0;
    return (
      <>
        <div
          className="game-image frame-stage relative rounded-xl border"
          aria-busy={!current && !failed}
        >
          <AnimatePresence initial={false}>
            {visible && (
              <m.div
                key={visible.src}
                className="frame-glow"
                aria-hidden
                style={{
                  backgroundImage: `url(${JSON.stringify(visible.src)})`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.28 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.5 }}
              />
            )}
          </AnimatePresence>
          <div className="frame-clip">
            <AnimatePresence initial={false}>
              {visible && (
                <m.img
                  key={`${visible.round}:${visible.src}`}
                  src={visible.src}
                  alt={`Визуальная подсказка ${visible.stage + 1} из 5`}
                  className="frame-picture"
                  draggable={false}
                  initial={{
                    opacity: 0,
                    x: reduced ? 0 : 18 * (visible.direction ?? 1),
                    clipPath:
                      !reduced && visible.wipe
                        ? 'circle(12% at 50% 50%)'
                        : 'circle(150% at 50% 50%)',
                    scale: reduced ? 1 : 1.012,
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    clipPath: 'circle(150% at 50% 50%)',
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: reduced ? 0.08 : visible.wipe ? 0.38 : 0.24,
                    ease: [0.22, 0.72, 0.22, 1],
                  }}
                />
              )}
            </AnimatePresence>
          </div>
          {!visible && !failed && (
            <Skeleton
              className="frame-loading frame-skeleton"
              role="status"
              aria-label="Загрузка кадра"
            />
          )}
          {failed && (
            <div className="frame-loading" role="alert">
              <span>Не удалось загрузить кадр</span>
              <Button
                variant="outline"
                onClick={() => {
                  setFailedKey(null);
                  setRetry((n) => n + 1);
                }}
              >
                <RefreshCw /> Повторить
              </Button>
            </div>
          )}
          {game.phase === 'playing' && (
            <>
              <button
                type="button"
                className="frame-arrow frame-arrow--left"
                aria-label="Предыдущий кадр"
                disabled={disabled || game.stage === 0}
                onClick={() => navigate(game.stage - 1)}
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                className="frame-arrow frame-arrow--right"
                aria-label="Следующий кадр"
                title={
                  game.stage < unlocked
                    ? 'Открытый кадр · бесплатно'
                    : 'Новый кадр · −5 с, −4 очка'
                }
                disabled={
                  disabled ||
                  game.stage === 4 ||
                  (!current && game.stage >= unlocked)
                }
                onClick={() => navigate(game.stage + 1)}
              >
                <ChevronRight />
              </button>
            </>
          )}
          {!current && visible && !failed && (
            <span
              className="frame-pending"
              role="status"
              aria-label="Загрузка следующего кадра"
            >
              <Skeleton className="h-1.5 w-14" />
            </span>
          )}
        </div>
        <div className="frame-thumbnails" aria-label="Открытые подсказки">
          {[0, 1, 2, 3, 4].map((stage) => {
            const shot = cache.get(`${game.roundId}:${stage}`);
            const open = stage <= unlocked;
            return (
              <button
                key={stage}
                type="button"
                aria-label={`Кадр ${stage + 1}${open ? ' · открыт' : ' · закрыт'}`}
                aria-current={game.stage === stage ? 'step' : undefined}
                disabled={disabled || !open || game.phase !== 'playing'}
                onClick={() => navigate(stage)}
              >
                {shot ? (
                  <img src={shot.src} alt="" />
                ) : (
                  <span>{stage + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      </>
    );
  },
  (previous, next) =>
    previous.disabled === next.disabled &&
    previous.navigate === next.navigate &&
    previous.onLoaded === next.onLoaded &&
    previous.game.image === next.game.image &&
    previous.game.roundId === next.game.roundId &&
    previous.game.stage === next.game.stage &&
    previous.game.unlockedStage === next.game.unlockedStage &&
    previous.game.phase === next.game.phase,
);
