import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RoomSession } from '@filmless/contracts';
import { RoomsService } from './rooms.service';
type Entry = { nickname: string; touched: number; session?: RoomSession };
@Injectable()
export class BattleService {
  private quick = new Map<string, Entry & { kind: 'duel' | 'group' }>();
  quickStatus(id: string) {
    for (const [key, e] of this.quick)
      if (
        (e.touched + 30000 < Date.now() && !e.session) ||
        (e.session && !this.rooms.battleAvailable(e.session))
      )
        this.quick.delete(key);
    const entry = this.quick.get(id);
    if (!entry) return { status: 'idle' as const };
    entry.touched = Date.now();
    return entry.session
      ? { status: 'matched' as const, session: entry.session }
      : {
          status: 'waiting' as const,
          kind: entry.kind,
          waiting: [...this.quick.values()].filter(
            (e) => e.kind === entry.kind && !e.session,
          ).length,
          required: entry.kind === 'duel' ? 2 : 4,
        };
  }
  quickJoin(account: { id: string; nickname: string }, kind: 'duel' | 'group') {
    this.quickStatus(account.id);
    if (this.quick.has(account.id)) return this.quickStatus(account.id);
    if (this.quick.size >= 400)
      throw new ServiceUnavailableException('Очередь заполнена.');
    const needed = kind === 'duel' ? 2 : 4;
    const peers = [...this.quick.entries()]
      .filter(([, e]) => e.kind === kind && !e.session)
      .slice(0, needed - 1);
    if (peers.length === needed - 1) {
      const sessions = this.rooms.createQuick([
        ...peers.map(([, e]) => ({ nickname: e.nickname })),
        account,
      ]);
      peers.forEach(([, e], i) => {
        e.session = sessions[i];
        e.touched = Date.now();
      });
      this.quick.set(account.id, {
        kind,
        nickname: account.nickname,
        touched: Date.now(),
        session: sessions[needed - 1],
      });
    } else
      this.quick.set(account.id, {
        kind,
        nickname: account.nickname,
        touched: Date.now(),
      });
    return this.quickStatus(account.id);
  }
  quickCancel(id: string) {
    if (this.quick.get(id)?.session)
      throw new ConflictException('Игра уже найдена.');
    this.quick.delete(id);
    return { status: 'idle' as const };
  }
  private entries = new Map<string, Entry>();
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}
  private prune() {
    for (const [id, e] of this.entries) {
      if (!e.session && e.touched + 30_000 < Date.now())
        this.entries.delete(id);
      if (e.session && !this.rooms.battleAvailable(e.session))
        this.entries.delete(id);
    }
  }
  status(id: string) {
    this.prune();
    const e = this.entries.get(id);
    if (!e) return { status: 'idle' as const };
    e.touched = Date.now();
    return e.session
      ? { status: 'matched' as const, session: e.session }
      : { status: 'waiting' as const };
  }
  join(account: { id: string; nickname: string }) {
    this.prune();
    if (this.entries.has(account.id)) return this.status(account.id);
    if (this.entries.size >= 400)
      throw new ServiceUnavailableException(
        'Очередь заполнена. Попробуйте позже.',
      );
    const opponent = [...this.entries.entries()].find(([, e]) => !e.session);
    if (!opponent) {
      this.entries.set(account.id, {
        nickname: account.nickname,
        touched: Date.now(),
      });
    } else {
      const sessions = this.rooms.createBattle(
        opponent[1].nickname,
        account.nickname,
        [opponent[0], account.id],
      );
      opponent[1].session = sessions[0];
      this.entries.set(account.id, {
        nickname: account.nickname,
        touched: Date.now(),
        session: sessions[1],
      });
    }
    return this.status(account.id);
  }
  cancel(id: string) {
    this.prune();
    if (this.entries.get(id)?.session)
      throw new ConflictException('Соперник уже найден. Перейдите в дуэль.');
    this.entries.delete(id);
    return { status: 'idle' as const };
  }
}
