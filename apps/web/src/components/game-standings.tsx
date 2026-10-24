'use client';
import { memo } from 'react';
import type { GameSnapshot } from '@filmless/contracts';
import { m } from './motion-system';
import { Card } from './ui/card';
export const GameStandings = memo(function GameStandings({
  game,
  playerId,
  now,
}: {
  game: GameSnapshot;
  playerId: string;
  now: number;
}) {
  return (
    <>
      {' '}
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
    </>
  );
});
