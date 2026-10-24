import { ForbiddenException } from '@nestjs/common';
import { Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { z } from 'zod';
import { Server, Socket } from 'socket.io';
import {
  collectionSchema,
  readySchema,
  kickPlayerSchema,
  roomSettingsSchema,
  roomAuthSchema,
  answerSchema,
  searchSchema,
  type AnswerAck,
  type SearchAck,
  type RoomAck,
} from '@filmless/contracts';
import { RoomsService } from './rooms.service';
@WebSocketGateway({ maxHttpBufferSize: 8192 })
export class RoomsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer() server!: Server;
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}
  private timer?: ReturnType<typeof setInterval>;
  onModuleInit() {
    this.timer = setInterval(() => {
      for (const code of this.rooms.tick()) this.publish(code);
    }, 250);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private access(socket: Socket, error: unknown) {
    if (!(error instanceof ForbiddenException)) return;
    const data = error.getResponse();
    if (
      typeof data === 'object' &&
      'code' in data &&
      data.code === 'GUEST_LIMIT' &&
      'loginUrl' in data
    )
      socket.emit('access:required', { url: data.loginUrl });
  }
  private auth(socket: Socket) {
    const now = Date.now();
    if (!socket.data.rate || now - socket.data.rate.since >= 1000)
      socket.data.rate = { since: now, count: 0 };
    if (++socket.data.rate.count > 20)
      throw new Error('Слишком много запросов. Подождите секунду.');
    const auth = roomAuthSchema.safeParse(socket.data.auth);
    if (!auth.success) throw new Error('Войдите в комнату снова.');
    return auth.data;
  }
  @SubscribeMessage('room:settings')
  settings(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): RoomAck {
    try {
      const auth = this.auth(socket),
        input = roomSettingsSchema.safeParse(body);
      if (!input.success)
        return { ok: false, message: 'Проверьте настройки партии.' };
      this.rooms.settings(auth.code, auth.token, input.data);
      this.publish(auth.code);
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось сохранить настройки.',
      };
    }
  }
  @SubscribeMessage('room:tastes') tastes(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): RoomAck {
    try {
      const a = this.auth(socket);
      const { tastes } = z
        .object({ tastes: z.array(collectionSchema).max(3) })
        .strict()
        .parse(body);
      this.rooms.tastes(a.code, a.token, tastes);
      this.publish(a.code);
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Не удалось сохранить.',
      };
    }
  }
  @SubscribeMessage('game:rematch') rematch(
    @ConnectedSocket() socket: Socket,
  ): RoomAck {
    try {
      const a = this.auth(socket);
      this.rooms.rematch(a.code, a.token);
      this.publish(a.code);
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Реванш недоступен.',
      };
    }
  }
  @SubscribeMessage('game:start')
  start(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body?: unknown,
  ): RoomAck {
    try {
      const a = this.auth(socket);
      const force =
        typeof body === 'object' && body !== null && 'force' in body
          ? Boolean((body as { force: unknown }).force)
          : false;
      this.rooms.start(a.code, a.token, force);
      this.publish(a.code);
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      this.publish(socket.data.auth?.code);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Не удалось начать партию.',
      };
    }
  }
  @SubscribeMessage('game:answer')
  answer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): AnswerAck {
    try {
      const a = this.auth(socket);
      const input = answerSchema.safeParse(body);
      if (!input.success) return { ok: false, message: 'Некорректный ответ.' };
      const result = this.rooms.answer(a.code, a.token, input.data);
      this.publish(a.code);
      return { ok: true, ...result };
    } catch (error) {
      this.access(socket, error);
      this.publish(socket.data.auth?.code);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Не удалось принять ответ.',
      };
    }
  }
  @SubscribeMessage('game:skip')
  skip(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): RoomAck {
    try {
      const a = this.auth(socket);
      const input = z
        .object({ roundId: z.string().uuid() })
        .strict()
        .parse(body);
      this.rooms.skip(a.code, a.token, input.roundId);
      this.publish(a.code);
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      this.publish(socket.data.auth?.code);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Не удалось пропустить.',
      };
    }
  }
  @SubscribeMessage('game:hint')
  hint(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): RoomAck {
    try {
      const a = this.auth(socket);
      const input = z
        .object({
          roundId: z.string().uuid(),
          stage: z.number().int().min(0).max(4),
        })
        .strict()
        .parse(body);
      this.rooms.select(a.code, a.token, input.roundId, input.stage);
      this.publish(a.code);
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      this.publish(socket.data.auth?.code);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Не удалось открыть кадр.',
      };
    }
  }
  @SubscribeMessage('game:search')
  search(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): SearchAck {
    try {
      const a = this.auth(socket);
      const input = searchSchema.safeParse(body);
      if (!input.success)
        return { ok: false, message: 'Введите от 2 до 80 символов.' };
      return {
        ok: true,
        titles: this.rooms.search(a.code, a.token, input.data.query),
      };
    } catch (error) {
      this.access(socket, error);
      this.publish(socket.data.auth?.code);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Поиск недоступен.',
      };
    }
  }
  publish(code: string) {
    for (const socketId of this.server.sockets.adapter.rooms.get(code) ?? []) {
      const s = this.server.sockets.sockets.get(socketId);
      if (!s?.data.auth) continue;
      try {
        s.emit('room:snapshot', this.rooms.snapshot(code, s.data.auth.token));
        s.emit('game:personal', this.rooms.personal(code, s.data.auth.token));
      } catch {
        // A departed membership must not block updates to remaining players.
      }
    }
  }
  handleConnection(socket: Socket) {
    const auth = roomAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      socket.emit('room:error', 'Некорректная сессия.');
      socket.disconnect();
      return;
    }
    try {
      this.rooms.connect(auth.data.code, auth.data.token, socket.id);
      socket.data.auth = auth.data;
      void socket.join(auth.data.code);
      this.publish(auth.data.code);
    } catch (error) {
      this.access(socket, error);
      socket.emit(
        'room:error',
        'Комната или сессия недействительна. Войдите снова.',
      );
      socket.disconnect();
    }
  }
  handleDisconnect(socket: Socket) {
    const auth = roomAuthSchema.safeParse(socket.data.auth);
    if (!auth.success) return;
    this.rooms.disconnect(auth.data.code, socket.id);
    this.publish(auth.data.code);
  }
  @SubscribeMessage('room:ready')
  ready(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): RoomAck {
    const input = readySchema.safeParse(body);
    const auth = roomAuthSchema.safeParse(socket.data.auth);
    if (!input.success || !auth.success)
      return { ok: false, message: 'Некорректный запрос.' };
    try {
      this.rooms.ready(auth.data.code, auth.data.token, input.data.ready);
      this.publish(auth.data.code);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Сессия истекла. Войдите снова.' };
    }
  }
  @SubscribeMessage('room:kick')
  kick(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): RoomAck {
    const auth = roomAuthSchema.safeParse(socket.data.auth);
    const input = kickPlayerSchema.safeParse(body);
    if (!auth.success || !input.success)
      return { ok: false, message: 'Некорректный запрос на удаление.' };
    try {
      const removed = this.rooms.kick(
        auth.data.code,
        auth.data.token,
        input.data.playerId,
      );
      this.publish(auth.data.code);
      if (removed) {
        for (const s of this.server.sockets.sockets.values()) {
          if (removed.sockets.has(s.id)) {
            void s.leave(auth.data.code);
            s.data.auth = undefined;
            s.emit('room:error', 'Вы были удалены организатором комнаты.');
            s.disconnect();
          }
        }
      }
      return { ok: true };
    } catch (error) {
      this.access(socket, error);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Не удалось удалить игрока.',
      };
    }
  }
  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() socket: Socket): RoomAck {
    const auth = roomAuthSchema.safeParse(socket.data.auth);
    if (!auth.success) return { ok: false, message: 'Некорректная сессия.' };
    try {
      this.rooms.leave(auth.data.code, auth.data.token);
      this.publish(auth.data.code);
      // All connections carrying this membership lose access immediately.
      for (const s of this.server.sockets.sockets.values())
        if (s.data.auth?.token === auth.data.token) {
          void s.leave(auth.data.code);
          s.data.auth = undefined;
          if (s.id !== socket.id) {
            s.emit('room:error', 'Вы вышли из комнаты в другой вкладке.');
            s.disconnect();
          }
        }
      return { ok: true };
    } catch {
      return { ok: false, message: 'Комната недоступна.' };
    }
  }
}
