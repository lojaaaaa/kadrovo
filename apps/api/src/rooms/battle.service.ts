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
