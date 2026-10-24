'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import type {
  GameSnapshot,
  GamePersonal,
  TitleOption,
  SearchAck,
  AnswerAck,
  RoomAck,
} from '@filmless/contracts';
import { playSound } from '@/lib/sound';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { HelpTip } from './ui/help-tip';
import { Skeleton } from './ui/skeleton';
import { PosterImage } from './poster-image';
export function AnswerForm({
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
  const [queued, setQueued] = useState<TitleOption | null>(null);
  const [nextAllowedAt, setNextAllowedAt] = useState(0);
  const sending = useRef(false);
  const command = useRef<{ titleId: string; id: string } | null>(null);
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
      if (command.current?.titleId !== target.id) {
        command.current = { titleId: target.id, id: crypto.randomUUID() };
      }
      const ack: AnswerAck = await socket
        .timeout(5000)
        .emitWithAck('game:answer', {
          roundId: game.roundId,
          commandId: command.current.id,
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
    onSuccess: (ack) => {
      setNextAllowedAt(ack.nextAllowedAt ?? 0);
      command.current = null;
    },
    onSettled: () => {
      sending.current = false;
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
      (Math.max(personal?.nextAllowedAt ?? 0, nextAllowedAt) - now) / 1000,
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
  useEffect(() => {
    if (activeOption)
      document
        .getElementById(`answer-option-${activeOption.id}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [activeOption]);
  const choose = (title: TitleOption) => {
    if (
      expired ||
      !connected ||
      sending.current ||
      answer.isPending ||
      skip.isPending
    )
      return;
    setSelected(title);
    setActive(-1);
    setDismissed(true);
    if (cooldown) {
      setQueued(title);
    } else {
      sending.current = true;
      answer.mutate(title);
    }
  };
  useEffect(() => {
    if (
      !queued ||
      cooldown ||
      expired ||
      !connected ||
      answer.isPending ||
      skip.isPending ||
      sending.current
    )
      return;
    sending.current = true;
    setQueued(null);
    answer.mutate(queued);
  }, [queued, cooldown, expired, connected, answer, skip.isPending]);
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
            onClick={() => {
              setQueued(null);
              skip.mutate();
            }}
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
        if (activeOption) choose(activeOption);
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
                }
              }
            }}
            maxLength={80}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setQueued(null);
              setActive(-1);
              setDismissed(false);
              answer.reset();
            }}
            placeholder="Название фильма"
            disabled={expired || answer.isPending || skip.isPending}
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
                <div
                  className="search-skeleton"
                  role="status"
                  aria-label="Поиск фильмов"
                >
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i}>
                      <Skeleton className="h-12 w-8 shrink-0 rounded-md" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                  ))}
                </div>
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
                        className="search-film-option aria-selected:bg-primary/20 flex h-full w-full items-center gap-3 rounded-xl border p-2 text-left hover:border-primary hover:bg-secondary focus-visible:bg-secondary transition-colors"
                        disabled={
                          answer.isPending || skip.isPending || !!queued
                        }
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
        {selected && answer.isError && (
          <Button
            type="button"
            className="answer-retry h-11 min-w-0 px-3 text-sm"
            disabled={
              !!cooldown ||
              expired ||
              !connected ||
              answer.isPending ||
              skip.isPending
            }
            onClick={() => choose(selected)}
          >
            Повторить
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="answer-skip h-11 px-5 text-sm shrink-0"
          disabled={!connected || expired || answer.isPending || skip.isPending}
          onClick={() => {
            setQueued(null);
            skip.mutate();
          }}
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
        {queued
          ? `Ответ отправится через ${cooldown} с`
          : answer.isPending
            ? 'Проверяем ответ…'
            : answer.error
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
  return (
    <PosterImage
      src={url}
      sizes="48px"
      className="h-16 w-11 shrink-0 rounded-md"
    />
  );
}
