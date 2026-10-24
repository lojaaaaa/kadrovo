'use client';
import { clearMatchmaking } from '@/lib/matchmaking';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountState } from '@/lib/account';
import { createStore, useStore } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import {
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
import { SectionSkeleton } from './section-skeleton';
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
  const client = useQueryClient();
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
    socket.on('access:required', async (detail: { url: string }) => {
      if (client.getQueryData<AccountState>(['account'])?.account) return;
      await socket
        .timeout(3000)
        .emitWithAck('room:leave')
        .catch(() => undefined);
      try {
        localStorage.removeItem(sessionKey(code));
        localStorage.removeItem('kadrovo:active-room');
      } catch {
        /* Storage can be unavailable. */
      }
      window.dispatchEvent(
        new CustomEvent('kadrovo:access-required', { detail }),
      );
    });
    socket.on('room:error', (message: string) => {
      void clearMatchmaking(client);
      store.setState({ error: message, session: null, room: null });
      try {
        localStorage.removeItem(sessionKey(code));
        if (localStorage.getItem('kadrovo:active-room') === code)
          localStorage.removeItem('kadrovo:active-room');
      } catch {
        /* Storage may be disabled; in-memory session is cleared. */
      }
    });
    socket.on('game:personal', (personal: GamePersonal | null) =>
      store.setState({ personal }),
    );
    socket.on('room:snapshot', (snapshot: RoomSnapshot) => {
      const previous = store.getState().room?.game;
      if (
        snapshot.code === code &&
        snapshot.game &&
        (previous?.matchId !== snapshot.game.matchId ||
          (previous.phase !== 'finished' && snapshot.game.phase === 'finished'))
      ) {
        void client.invalidateQueries({ queryKey: ['experience'] });
        void client.invalidateQueries({ queryKey: ['daily-archive'] });
        if (snapshot.game.phase === 'finished')
          void client.invalidateQueries({ queryKey: ['ratings'] });
      }
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
  }, [session, code, store, client]);
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
  async function leave() {
    if (pending) return;
    setPending(true);
    try {
      const socket = socketRef.current;
      if (!socket?.connected)
        throw new Error('Дождитесь подключения, чтобы выйти из комнаты.');
      const ack: RoomAck = await socket.timeout(5000).emitWithAck('room:leave');
      if (!ack.ok && ack.message !== 'Комната недоступна.')
        throw new Error(ack.message);
    } catch (error) {
      setPending(false);
      store.setState({
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось выйти. Попробуйте ещё раз.',
      });
      return;
    }
    await clearMatchmaking(client);
    try {
      localStorage.removeItem(sessionKey(code));
      localStorage.removeItem('kadrovo:active-room');
    } catch {
      /* Private browsing. */
    }
    socketRef.current?.disconnect();
    setPending(false);
    router.push('/');
  }
  return (
    <main
      className={`screen screen--room mx-auto max-w-7xl px-3 sm:px-5 ${active ? 'game-room py-2' : 'py-6'}`}
    >
      <h1 className="sr-only">{room?.format === 'party' ? 'Лобби' : 'Игра'}</h1>
      {!loaded ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-10 w-72 rounded-xl" />
          <div className="rounded-2xl border border-border/50 bg-card/40 p-6 space-y-4">
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
          {!room && <SectionSkeleton kind="game" />}
          {room && !connected && (
            <p className="my-1 text-xs text-muted-foreground" role="status">
              Подключаемся…
            </p>
          )}
          {room && (
            <>
              {room.format === 'battle' &&
                room.capacity === 2 &&
                room.game?.phase === 'playing' &&
                room.players.some(
                  (p) => p.id !== session.playerId && !p.connected,
                ) && (
                  <p
                    role="status"
                    className="mb-3 text-sm text-muted-foreground"
                  >
                    Соперник отключился. Ждём переподключения…
                  </p>
                )}
              {/* 1. Active or Finished Game View */}
              {room.game && (!isFinished || !viewLobby) && (
                <GameBoard
                  room={room}
                  session={session}
                  rematch={() => {
                    socketRef.current
                      ?.timeout(5000)
                      .emit(
                        'game:rematch',
                        (err: Error | null, ack: RoomAck) => {
                          if (err || !ack?.ok)
                            store.setState({
                              error: err
                                ? 'Нет связи.'
                                : ack.ok
                                  ? null
                                  : ack.message,
                            });
                        },
                      );
                  }}
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
                      <div className="flex items-center justify-between rounded-2xl border border-border/70 surface-panel bg-card p-4">
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

              {!room.game && room.format !== 'party' && (
                <SectionSkeleton kind="game" />
              )}
              {start.error && (
                <p role="alert" className="text-destructive">
                  {start.error.message}
                </p>
              )}
              {room.format === 'battle' && isFinished && (
                <Link
                  href={room.ranked ? '/battle' : '/online'}
                  className="mt-5 block text-primary"
                >
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
