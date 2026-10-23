'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { createStore, useStore } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import {
  categoryLabels,
  modeLabels,
  type RoomSession,
  type RoomSnapshot,
  type RoomAck,
  type GamePersonal,
} from '@filmless/contracts';
import { PartyLobby } from './party-lobby';
import { GameBoard } from './game-board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { roomRequest, saveSession, sessionKey } from '@/lib/rooms';
type LobbyState = {
  session: RoomSession | null;
  room: RoomSnapshot | null;
  connected: boolean;
  loaded: boolean;
  error: string | null;
  personal: GamePersonal | null;
  receivedAt: number;
};
export function RoomLobby({ code }: { code: string }) {
  const router = useRouter();
  const [store] = useState(() =>
    createStore<LobbyState>(() => ({
      session: null,
      room: null,
      connected: false,
      loaded: false,
      error: null,
      personal: null,
      receivedAt: 0,
    })),
  );
  const { session, room, connected, loaded, error, personal, receivedAt } =
    useStore(store);
  const socketRef = useRef<Socket | null>(null);
  const [nickname, setNickname] = useState('');
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [pending, setPending] = useState(false);
  const [viewLobby, setViewLobby] = useState(false);
  useEffect(() => {
    let session: RoomSession | null = null;
    try {
      const raw = localStorage.getItem(sessionKey(code));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.code === code &&
          typeof parsed.token === 'string' &&
          typeof parsed.playerId === 'string'
        )
          session = parsed;
      }
    } catch {
      /* Storage may be unavailable; guest can join again. */
    }
    store.setState({ session, loaded: true, room: null, error: null });
  }, [code, store]);
  useEffect(() => {
    if (!session) return;
    const socket = io({
      auth: { code, token: session.token },
      reconnection: true,
    });
    socketRef.current = socket;
    socket.on('connect', () =>
      store.setState({ connected: true, error: null }),
    );
    socket.on('disconnect', () => store.setState({ connected: false }));
    socket.on('connect_error', () =>
      store.setState({
        connected: false,
        error: 'Связь прервана. Пробуем подключиться снова…',
      }),
    );
    socket.on('room:error', (message: string) => {
      store.setState({ error: message, session: null, room: null });
      try {
        localStorage.removeItem(sessionKey(code));
      } catch {
        /* Storage may be disabled; in-memory session is cleared. */
      }
    });
    socket.on('game:personal', (personal: GamePersonal | null) =>
      store.setState({ personal }),
    );
    socket.on('room:snapshot', (snapshot: RoomSnapshot) => {
      if (snapshot.code === code && snapshot.game?.phase === 'playing') {
        setViewLobby(false);
      }
      if (snapshot.code === code)
        store.setState((s) =>
          !s.room || snapshot.revision >= s.room.revision
            ? { room: snapshot, receivedAt: performance.now() }
            : {},
        );
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session, code, store]);
  const join = useMutation({
    mutationFn: async () => {
      const s = await roomRequest(`/${code}/join`, { nickname });
      saveSession(s);
      return s;
    },
    onSuccess: (s) => store.setState({ session: s, error: null }),
  });
  const start = useMutation({
    mutationFn: async (force?: boolean) => {
      if (!socketRef.current?.connected) throw new Error('Нет соединения.');
      const ack: RoomAck = await socketRef.current
        .timeout(5000)
        .emitWithAck('game:start', { force: Boolean(force) });
      if (!ack.ok) throw new Error(ack.message);
    },
  });
  const active = room?.game && room.game.phase !== 'finished';
  const isFinished = room?.game?.phase === 'finished';

  const allReady =
    !!room &&
    room.players.length >= (room.format === 'solo' ? 1 : 2) &&
    room.players.every(
      (p) => (room.format === 'solo' || p.ready) && p.connected,
    );
  const me = room?.players.find((p) => p.id === session?.playerId);
  async function copyLink(kind: 'link' | 'code' = 'link') {
    try {
      await navigator.clipboard.writeText(
        kind === 'code' ? code : window.location.href,
      );
      setCopied(kind);
    } catch {
      store.setState({
        error: 'Не удалось скопировать. Выделите ссылку ниже.',
      });
    }
  }
  function ready() {
    const socket = socketRef.current;
    if (!socket || !me) return;
    setPending(true);
    socket
      .timeout(5000)
      .emit(
        'room:ready',
        { ready: !me.ready },
        (err: Error | null, ack: RoomAck) => {
          setPending(false);
          if (err || !ack?.ok)
            store.setState({
              error: err
                ? 'Нет ответа сервера. Попробуйте ещё раз.'
                : ack.ok
                  ? null
                  : ack.message,
            });
        },
      );
  }
  function leave() {
    if (!socketRef.current) return;
    setPending(true);
    socketRef.current
      .timeout(5000)
      .emit('room:leave', (err: Error | null, ack: RoomAck) => {
        setPending(false);
        if (err || !ack?.ok) {
          store.setState({ error: 'Не удалось выйти. Попробуйте ещё раз.' });
          return;
        }
        localStorage.removeItem(sessionKey(code));
        socketRef.current?.disconnect();
        router.push('/');
      });
  }
  return (
    <main
      className={`mx-auto max-w-7xl px-3 sm:px-5 ${active ? 'game-room py-2' : 'py-6'}`}
    >
      <h1
        className={
          room?.game || room?.format === 'party'
            ? 'sr-only'
            : 'mt-3 text-3xl font-black text-white'
        }
      >
        {room?.format === 'solo'
          ? 'Тренировка без спешки'
          : room?.format === 'battle'
            ? 'Дуэль 1 на 1'
            : 'Все свои. Почти в сборе.'}
      </h1>
      {!loaded ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-10 w-72 rounded-xl" />
          <div className="rounded-3xl border border-border/50 bg-card/40 p-6 space-y-4">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      ) : !session ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate();
          }}
        >
          <Label htmlFor="join-name">Ваш ник</Label>
          <Input
            id="join-name"
            required
            maxLength={24}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Как вас зовут в игре?"
          />
          <Button disabled={join.isPending || !nickname.trim()}>
            {join.isPending ? 'Подключаемся…' : 'Присоединиться'}
          </Button>
          {join.error && (
            <p role="alert" className="text-destructive">
              {join.error.message}
            </p>
          )}
        </form>
      ) : (
        <>
          {!connected && (
            <p className="my-1 text-xs text-muted-foreground" role="status">
              Подключаемся…
            </p>
          )}
          {room && (
            <>
              {/* 1. Active or Finished Game View */}
              {room.game && (!isFinished || !viewLobby) && (
                <GameBoard
                  leave={leave}
                  restart={() => start.mutate(room.format === 'party')}
                  restarting={start.isPending}
                  isHost={room.hostId === session.playerId}
                  format={room.format}
                  onOpenLobby={
                    room.format === 'party'
                      ? () => setViewLobby(true)
                      : undefined
                  }
                  game={room.game}
                  personal={personal}
                  getSocket={() => socketRef.current}
                  connected={connected}
                  receivedAt={receivedAt}
                  playerId={session.playerId}
                />
              )}

              {/* 2. Party Lobby (Pre-game, or when toggled in finished party) */}
              {(!room.game || (isFinished && viewLobby)) &&
                room.format === 'party' && (
                  <div className="space-y-4">
                    {isFinished && (
                      <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-white">
                          Вы находитесь в настройках лобби
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewLobby(false)}
                          className="rounded-xl border-border/70 text-white"
                        >
                          ← К результатам игры
                        </Button>
                      </div>
                    )}
                    <PartyLobby
                      room={room}
                      session={session}
                      connected={connected}
                      pending={pending}
                      copied={copied}
                      copy={copyLink}
                      ready={ready}
                      start={(force?: boolean) => start.mutate(force)}
                      starting={start.isPending}
                      leave={leave}
                      getSocket={() => socketRef.current}
                    />
                  </div>
                )}

              {/* 3. Solo / Battle Pre-game (before game has started) */}
              {!room.game && room.format !== 'party' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2.5 text-sm">
                    <span className="rounded-xl border border-border/60 bg-secondary px-4 py-2 font-semibold text-white">
                      {categoryLabels[room.category]}
                    </span>
                    <span className="rounded-xl border border-border/60 bg-secondary px-4 py-2 font-semibold text-white">
                      {modeLabels[room.mode]} · {room.roundSeconds} с
                    </span>
                    <span className="rounded-xl border border-border/60 bg-secondary px-4 py-2 font-semibold text-primary">
                      {room.source === 'catalog' ? 'Кинокаталог' : 'Демо'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {room.hostId === session.playerId && (
                      <Button
                        size="lg"
                        className="rounded-2xl bg-primary text-white font-bold h-13 px-7 shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95"
                        onClick={() => start.mutate()}
                        disabled={!allReady || !connected || start.isPending}
                      >
                        {start.isPending ? 'Запускаем…' : 'Начать тренировку'}
                      </Button>
                    )}
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-2xl h-13 px-6 border-border/70 text-muted-foreground hover:text-white"
                      onClick={leave}
                      disabled={!connected || pending}
                    >
                      Выйти
                    </Button>
                  </div>
                </div>
              )}
              {start.error && (
                <p role="alert" className="text-destructive">
                  {start.error.message}
                </p>
              )}
              {room.format === 'battle' && !active && (
                <Link href="/battle" className="mt-5 block text-primary">
                  К поиску соперника →
                </Link>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-5 text-destructive">
          {error}
        </p>
      )}
    </main>
  );
}
