'use client';
import { AnswerChoice } from './answer-choice';
import { CompanyTastes } from './company-tastes';
import { Skeleton } from './ui/skeleton';
import { HelpTip } from './ui/help-tip';
import { CollectionPicker } from './collection-picker';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  LogOut,
  Clapperboard,
  Copy,
  Crown,
  Link2,
  Play,
  Users,
  Check,
  Clock3,
  UserX,
} from 'lucide-react';
import {
  categoryLabels,
  modeLabels,
  type ContentAvailability,
  type RoomSnapshot,
  type RoomSession,
  type RoomSettings,
  type RoomAck,
} from '@filmless/contracts';
import type { Socket } from 'socket.io-client';
import { api } from '@/lib/account';
import { Button } from './ui/button';
import { Input } from './ui/input';
export function PartyLobby({
  room,
  session,
  connected,
  pending,
  copied,
  copy,
  ready,
  start,
  starting,
  leave,
  getSocket,
}: {
  room: RoomSnapshot;
  session: RoomSession;
  connected: boolean;
  pending: boolean;
  copied: 'link' | 'code' | null;
  copy: (kind: 'link' | 'code') => void;
  ready: () => void;
  start: (force?: boolean) => void;
  starting: boolean;
  leave: () => void;
  getSocket: () => Socket | null;
}) {
  const host = room.hostId === session.playerId,
    me = room.players.find((p) => p.id === session.playerId);
  const availability = useQuery({
    queryKey: ['content-availability'],
    queryFn: () => api<ContentAvailability>('content/availability'),
    refetchInterval: 30000,
  });
  const update = useMutation({
    mutationFn: async (patch: Partial<RoomSettings>) => {
      const socket = getSocket();
      if (!socket?.connected) throw new Error('Нет соединения.');
      const ack: RoomAck = await socket
        .timeout(5000)
        .emitWithAck('room:settings', {
          collection: room.collection ?? 'all',
          category: room.category,
          mode: room.mode,
          roundSeconds: room.roundSeconds,
          totalRounds: room.totalRounds ?? 3,
          source: room.source,
          ...patch,
        });
      if (!ack.ok) throw new Error(ack.message);
    },
  });
  const kickMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const socket = getSocket();
      if (!socket?.connected) throw new Error('Нет соединения.');
      const ack: RoomAck = await socket
        .timeout(5000)
        .emitWithAck('room:kick', { playerId });
      if (!ack.ok) throw new Error(ack.message);
    },
  });
  const count =
    availability.data?.collections
      ?.find((c) => c.id === (room.collection ?? 'all'))
      ?.categories.find((c) => c.category === room.category)?.[room.mode] ?? 0;
  const allReady =
    room.players.length >= 2 &&
    room.players.every((p) => p.ready && p.connected);
  const editable = host && connected && !update.isPending;
  const reason =
    room.players.length < 2
      ? 'Пригласите хотя бы одного друга'
      : room.players.some((p) => !p.connected)
        ? 'Ждём подключения игроков'
        : !allReady
          ? 'Ждём готовности всех игроков'
          : 'Все готовы. Можно начинать!';
  return (
    <div className="party-lobby min-w-0 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3">
            <Clapperboard className="size-7 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">
              Лобби
            </p>
            <h2 className="mt-1 text-3xl font-black">
              {room.name || 'Зал ожидания'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {modeLabels[room.mode]} · {categoryLabels[room.category]}
            </p>
          </div>
        </div>
        <div className="lobby-header-actions">
          <span className="lobby-meta">
            {room.players.filter((p) => p.connected).length} в сети ·{' '}
            {room.totalRounds ?? 3} раундов
          </span>
          <Button
            variant="outline"
            className="lobby-leave"
            onClick={leave}
            disabled={pending}
          >
            <LogOut className="size-4" />
            Выйти из лобби
          </Button>
        </div>
      </header>
      <div className="lobby-columns grid items-start gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-2xl border surface-panel bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Код комнаты
            </p>
            <button
              onClick={() => copy('code')}
              className="font-mono text-3xl tracking-[.16em] text-primary"
              title="Скопировать код"
            >
              {room.code}
            </button>
            <p className="text-sm text-muted-foreground">
              Для входа достаточно ссылки или кода.
            </p>
            <Input
              aria-label="Ссылка для друзей"
              readOnly
              value={
                typeof window === 'undefined'
                  ? `/room/${room.code}`
                  : `${window.location.origin}/room/${room.code}`
              }
              onFocus={(e) => e.target.select()}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => copy('code')}>
                <Copy className="size-4" />
                {copied === 'code' ? 'Скопировано' : 'Код'}
              </Button>
              <Button variant="outline" onClick={() => copy('link')}>
                <Link2 className="size-4" />
                {copied === 'link' ? 'Скопировано' : 'Ссылка'}
              </Button>
            </div>
          </section>
          <section className="rounded-2xl border surface-panel bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold">
                <Users className="size-4" />
                Игроки
              </h3>
              <span className="text-sm text-muted-foreground">
                {room.players.length}/{room.capacity}
              </span>
            </div>
            <ul className="space-y-3">
              {room.players.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${p.id === session.playerId ? 'border-primary/30 bg-primary/5' : 'border-border bg-background/40'}`}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary font-bold text-primary">
                    {p.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 break-all text-sm font-semibold">
                      {p.nickname}
                      {p.id === room.hostId && (
                        <Crown
                          aria-label="Организатор"
                          className="size-3 shrink-0 text-primary"
                        />
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.id === session.playerId ? 'Вы · ' : ''}
                      {!p.connected
                        ? 'Не в сети'
                        : p.ready
                          ? 'Готов к игре'
                          : 'Ожидает старта'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.ready && <Check className="size-4 text-primary" />}
                    {host && p.id !== session.playerId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title={`Удалить ${p.nickname} из комнаты`}
                        disabled={kickMutation.isPending}
                        onClick={() => kickMutation.mutate(p.id)}
                      >
                        <UserX className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {kickMutation.error && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {kickMutation.error.message}
              </p>
            )}
          </section>
        </div>
        <section className="lobby-settings min-w-0 space-y-3 rounded-2xl border surface-panel bg-card p-4">
          <div className="flex justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">
                {host ? 'Настройки' : 'Параметры игры'}
              </h3>
            </div>
            <Clock3 className="size-5 text-primary" />
          </div>
          <label className="mb-4 block space-y-2 text-sm font-semibold">
            Название комнаты
            <Input
              key={room.name}
              defaultValue={room.name}
              maxLength={60}
              disabled={!editable}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== room.name) update.mutate({ name });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
          <fieldset disabled={!editable} className="mb-4 space-y-2">
            <legend className="mb-2 text-sm font-semibold">Ответы</legend>
            <AnswerChoice
              value={room.answerMode ?? 'search'}
              disabled={!editable}
              onChange={(answerMode) => update.mutate({ answerMode })}
            />
          </fieldset>
          <fieldset disabled={!editable} className="min-w-0 space-y-3">
            <legend className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Режим
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(modeLabels).map(([key, label]) => (
                <Button
                  key={key}
                  variant={room.mode === key ? 'default' : 'outline'}
                  aria-pressed={room.mode === key}
                  onClick={() =>
                    update.mutate({
                      mode: key as RoomSettings['mode'],
                      collection: 'all',
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!editable} className="min-w-0">
            <legend className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Количество раундов
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {([3, 5, 7, 10] as const).map((rounds) => (
                <Button
                  key={rounds}
                  variant={
                    (room.totalRounds ?? 3) === rounds ? 'default' : 'outline'
                  }
                  aria-pressed={(room.totalRounds ?? 3) === rounds}
                  onClick={() => update.mutate({ totalRounds: rounds })}
                >
                  {rounds}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!editable} className="min-w-0">
            <legend className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Время на раунд
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { sec: 15, label: '15 с' },
                { sec: 30, label: '30 с' },
                { sec: 45, label: '45 с' },
                { sec: 60, label: '60 с' },
                { sec: 90, label: '90 с' },
              ].map(({ sec, label }) => (
                <Button
                  key={sec}
                  variant={room.roundSeconds === sec ? 'default' : 'outline'}
                  aria-pressed={room.roundSeconds === sec}
                  onClick={() =>
                    update.mutate({
                      roundSeconds: sec as RoomSettings['roundSeconds'],
                    })
                  }
                  className="text-xs"
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!editable} className="min-w-0">
            <legend className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Категория
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(categoryLabels).map(([key, label]) => {
                const available =
                  room.source === 'demo' ||
                  (availability.data?.categories.find(
                    (c) => c.category === key,
                  )?.[room.mode] ?? 0) >= 3;
                return (
                  <Button
                    key={key}
                    disabled={!available}
                    variant={room.category === key ? 'default' : 'outline'}
                    onClick={() =>
                      update.mutate({
                        category: key as RoomSettings['category'],
                        collection: 'all',
                      })
                    }
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </fieldset>
          {room.source === 'catalog' && (
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm">
                Подборка ·{' '}
                {room.collection === 'all' || !room.collection
                  ? 'Все фильмы'
                  : room.collection}
              </summary>
              <div className="mt-3">
                <CollectionPicker
                  value={room.collection ?? 'all'}
                  onChange={(collection) => update.mutate({ collection })}
                  availability={availability.data}
                  category={room.category}
                  mode={room.mode}
                  disabled={!editable}
                />
              </div>
            </details>
          )}
          <CompanyTastes room={room} session={session} getSocket={getSocket} />
          <div className="lobby-content-meta">
            {availability.isPending ? (
              <Skeleton className="h-4 w-36" />
            ) : (
              <span>
                {room.source === 'catalog'
                  ? `${count} фильмов доступно`
                  : 'Демоподборка'}
              </span>
            )}
            <HelpTip label="Как начисляются очки">
              За фильм — до 20 очков. Новый кадр отнимает 5 секунд и 4 очка.
              Кадры и таймер у каждого игрока свои.
            </HelpTip>
          </div>
          {update.error && (
            <p role="alert" className="text-sm text-destructive">
              {update.error.message}
            </p>
          )}
        </section>
      </div>
      <footer className="lobby-actions rounded-2xl border surface-panel bg-card p-3">
        <p className="mb-2 text-sm text-muted-foreground" role="status">
          {reason}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            className="h-12"
            variant={me?.ready ? 'outline' : 'default'}
            disabled={!connected || pending || update.isPending}
            onClick={ready}
          >
            {me?.ready ? 'Готов · отменить' : 'Готов'}
          </Button>
          {host ? (
            <Button
              className="h-12 font-bold"
              disabled={
                !connected ||
                room.players.filter((p) => p.connected).length <
                  (room.minimumPlayers ?? 2) ||
                starting ||
                update.isPending
              }
              onClick={() => start(!allReady)}
            >
              <Play className="size-4" />
              {starting
                ? 'Запускаем…'
                : !allReady
                  ? 'Начать игру'
                  : room.game
                    ? 'Реванш'
                    : 'Начать игру'}
            </Button>
          ) : (
            <p className="self-center text-center text-sm text-muted-foreground">
              Игру запустит организатор
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
