'use client';
import { useMutation } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import type {
  RoomSnapshot,
  RoomSession,
  RoomAck,
  CollectionId,
} from '@filmless/contracts';
import { TastePicker } from './taste-picker';
export function CompanyTastes({
  room,
  session,
  getSocket,
}: {
  room: RoomSnapshot;
  session: RoomSession;
  getSocket: () => Socket | null;
}) {
  const change = useMutation({
    mutationFn: async (tastes: CollectionId[]) => {
      const ack: RoomAck = await getSocket()
        ?.timeout(5000)
        .emitWithAck('room:tastes', { tastes });
      if (!ack?.ok)
        throw new Error(ack && !ack.ok ? ack.message : 'Нет соединения.');
    },
  });
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Общий вкус ·{' '}
        {Object.values(room.tasteVotes ?? {}).filter((v) => v.length).length}{' '}
        участников выбрали
      </summary>
      <p className="my-3 text-muted-foreground">
        Выберите до трёх эпох. Чаще попадутся фильмы, интересные нескольким
        участникам.
      </p>
      <TastePicker
        value={room.tasteVotes?.[session.playerId] ?? []}
        onChange={(v) => change.mutate(v)}
        disabled={change.isPending}
      />
      {change.error && <p role="alert">{change.error.message}</p>}
    </details>
  );
}
