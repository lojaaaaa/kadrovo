import {
  Inject,
  Injectable,
  OnModuleDestroy,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { CatalogStore } from '../content/store';
import { AuthService } from '../auth/auth.service';
import { cookie, setCookie } from '../auth/security';
import {
  dailyWindow,
  type TitleOption,
  type RoomSession,
} from '@filmless/contracts';
import type { MatchState } from '../game/match';
export type DailyProgress = {
  updatedAt?: number;
  session?: RoomSession;
  state?: MatchState;
  score?: number;
  solved?: boolean;
};
export type Experience = {
  aliases?: string[];
  removedWatchlist?: string[];
  challenges?: Record<string, DailyProgress>;
  seen: Record<string, number>;
  daily: Record<string, DailyProgress>;
  watchlist: TitleOption[];
};
export type Challenge = {
  titleIds: string[];
  mode: 'frames' | 'spotlight' | 'mix' | 'pixels';
  category: 'movies' | 'series' | 'animation';
  source: 'demo' | 'catalog';
  answerMode: 'search' | 'choices';
  seconds: number;
  expiresAt: number;
  results: {
    subject: string;
    nickname: string;
    score: number;
    solved: number;
  }[];
};
@Injectable()
export class ExperienceService implements OnModuleDestroy {
  private logger = new Logger(ExperienceService.name);
  private pins = new Map<string, number>();
  retain(subject: string) {
    this.pins.set(subject, (this.pins.get(subject) ?? 0) + 1);
  }
  release(subject: string) {
    const n = (this.pins.get(subject) ?? 1) - 1;
    if (n <= 0) this.pins.delete(subject);
    else this.pins.set(subject, n);
  }
  private cache = new Map<string, Experience>();
  private dirty = new Set<string>();
  private retryTimer?: ReturnType<typeof setTimeout>;
  private writes = new Map<string, Promise<unknown>>();
  private loading = new Map<string, Promise<Experience>>();
  constructor(
    @Inject(CatalogStore) private store: CatalogStore,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  async identity(req: Request, res: Response) {
    let guest = cookie(req, 'kadrovo_guest');
    if (!/^[a-f0-9]{64}$/.test(guest)) {
      guest = randomBytes(32).toString('hex');
      setCookie(res, 'kadrovo_guest', guest, 365 * 86400_000);
    }
    const guestId = 'guest:' + createHash('sha256').update(guest).digest('hex');
    const account = await this.auth.session(cookie(req, 'filmless_session'));
    const subject = account ? 'account:' + account.id : guestId;
    await this.load(subject);
    if (account) {
      const from = await this.load(guestId),
        to = this.get(subject);
      let changed = false;
      to.aliases ??= [];
      if (!to.aliases.includes(guestId)) {
        to.aliases = [...to.aliases, guestId].slice(-10);
        changed = true;
      }
      for (const [id, at] of Object.entries(from.seen))
        if ((to.seen[id] ?? 0) < at) {
          to.seen[id] = at;
          changed = true;
        }
      const merge = (
        source: Record<string, DailyProgress>,
        target: Record<string, DailyProgress>,
      ) => {
        for (const [key, value] of Object.entries(source)) {
          const current = target[key];
          if (
            !current ||
            (current.score === undefined &&
              current.state?.id === value.state?.id &&
              (value.updatedAt ?? 0) > (current.updatedAt ?? 0))
          ) {
            target[key] = structuredClone(value);
            changed = true;
          }
        }
      };
      merge(from.daily, to.daily);
      if (from.challenges) {
        to.challenges ??= {};
        merge(from.challenges, to.challenges);
      }
      for (const t of from.watchlist)
        if (
          !to.removedWatchlist?.includes(t.id) &&
          !to.watchlist.some((v) => v.id === t.id) &&
          to.watchlist.length < 200
        ) {
          to.watchlist.push(t);
          changed = true;
        }
      if (changed) this.save(subject);
    }
    return subject;
  }
  private async load(subject: string): Promise<Experience> {
    const existing = this.cache.get(subject);
    if (existing) return existing;
    const pending = this.loading.get(subject);
    if (pending) return pending;
    const task = (async () => {
      const row = await this.store.db.contentState.findUnique({
        where: { key: 'player:' + subject },
      });
      const value = row?.value as unknown as Experience | null;
      const data =
        value && value.seen && value.daily && Array.isArray(value.watchlist)
          ? value
          : { seen: {}, daily: {}, watchlist: [] };
      if (this.cache.size >= 5000) {
        const idle = [...this.cache.keys()].find(
          (k) => !this.pins.has(k) && !this.writes.has(k) && !this.dirty.has(k),
        );
        if (idle) this.cache.delete(idle);
      }
      this.cache.set(subject, data);
      return data;
    })();
    this.loading.set(subject, task);
    try {
      return await task;
    } finally {
      this.loading.delete(subject);
    }
  }
  get(subject: string): Experience {
    const data = this.cache.get(subject);
    if (!data) throw new Error('История ещё загружается.');
    return data;
  }
  seen(subjects: string[]) {
    const result: Record<string, number> = {};
    for (const s of subjects)
      for (const [id, time] of Object.entries(this.get(s).seen))
        result[id] = Math.max(result[id] ?? 0, time);
    return result;
  }
  expose(subject: string, id: string) {
    const data = this.get(subject);
    data.seen[id] = Date.now();
    data.seen = Object.fromEntries(
      Object.entries(data.seen)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5000),
    );
    this.save(subject);
  }
  save(subject: string) {
    const data = this.get(subject);
    data.daily = Object.fromEntries(
      Object.entries(data.daily)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 400),
    );
    if (data.challenges)
      data.challenges = Object.fromEntries(
        Object.entries(data.challenges).slice(-50),
      );
    const value = JSON.parse(JSON.stringify(data));
    const previous = this.writes.get(subject) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(() =>
        this.store.db.contentState.upsert({
          where: { key: 'player:' + subject },
          create: { key: 'player:' + subject, value },
          update: { value },
        }),
      );
    this.writes.set(subject, task);
    void task
      .catch(() => {
        this.dirty.add(subject);
        this.logger.error('Не удалось сохранить игровую историю.');
        if (!this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            for (const id of this.dirty) {
              this.dirty.delete(id);
              this.save(id);
            }
          }, 5000);
          this.retryTimer.unref();
        }
      })
      .finally(() => {
        if (this.writes.get(subject) === task) this.writes.delete(subject);
      });
  }
  summary(subject: string) {
    const data = this.get(subject);
    const days = Object.entries(data.daily)
      .filter(([, v]) => v.score !== undefined)
      .sort((a, b) => b[0].localeCompare(a[0]));
    let streak = 0;
    const window = dailyWindow();
    const today = window.day;
    const shift = (day: string, n: number) =>
      new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000)
        .toISOString()
        .slice(0, 10);
    let day = data.daily[today]?.score !== undefined ? today : shift(today, -1);
    while (data.daily[day]?.solved) {
      streak++;
      day = shift(day, -1);
    }
    return {
      currentDaily: {
        ...window,
        status:
          data.daily[today]?.score !== undefined
            ? 'completed'
            : data.daily[today]?.state || data.daily[today]?.session
              ? 'in-progress'
              : 'new',
      },
      streak,
      watchlist: data.watchlist,
      daily: days.map(([day, v]) => ({
        day,
        score: v.score,
        solved: v.solved,
      })),
      seen: Object.keys(data.seen).length,
    };
  }
  private counters: Record<string, number> = {};
  private metricsTimer?: ReturnType<typeof setTimeout>;
  metric(name: string) {
    this.counters[name] = (this.counters[name] ?? 0) + 1;
    if (!this.metricsTimer) {
      this.metricsTimer = setTimeout(() => {
        this.metricsTimer = undefined;
        void this.flushMetrics().catch(() =>
          this.logger.warn('Метрики ожидают следующего сохранения.'),
        );
      }, 30000);
      this.metricsTimer.unref();
    }
  }
  private async flushMetrics() {
    const counters = this.counters;
    if (!Object.keys(counters).length) return;
    this.counters = {};
    const key = 'product-metrics:' + new Date().toISOString().slice(0, 10);
    try {
      const old = await this.store.db.contentState.findUnique({
        where: { key },
      });
      const previous = (old?.value ?? {}) as Record<string, number>;
      const value = { ...previous };
      for (const [name, n] of Object.entries(counters))
        value[name] = (value[name] ?? 0) + n;
      await this.store.db.contentState.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    } catch (error) {
      for (const [name, n] of Object.entries(counters))
        this.counters[name] = (this.counters[name] ?? 0) + n;
      throw error;
    }
  }
  async onModuleDestroy() {
    if (this.metricsTimer) clearTimeout(this.metricsTimer);
    await this.flushMetrics().catch(() => undefined);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await Promise.allSettled(this.writes.values());
  }
  hasResult(data: Challenge, subject: string) {
    const aliases = this.get(subject).aliases ?? [];
    return data.results.some(
      (r) => r.subject === subject || aliases.includes(r.subject),
    );
  }
  async challenge(id: string) {
    if (!/^[a-f0-9]{32}$/.test(id))
      throw new NotFoundException('Вызов не найден.');
    const row = await this.store.db.contentState.findUnique({
      where: { key: 'challenge:' + id },
    });
    const data = row?.value as unknown as Challenge | undefined;
    if (!data || data.expiresAt < Date.now())
      throw new NotFoundException('Срок вызова истёк.');
    return data;
  }
  async createChallenge(data: Challenge) {
    const id = randomBytes(16).toString('hex');
    await this.store.db.contentState.create({
      data: { key: 'challenge:' + id, value: JSON.parse(JSON.stringify(data)) },
    });
    return id;
  }
  async recordChallenge(
    id: string,
    subject: string,
    nickname: string,
    score: number,
    solved: number,
  ) {
    // Row lock makes the first result immutable across concurrent rooms.
    await this.store.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT key FROM "ContentState" WHERE key = ${'challenge:' + id} FOR UPDATE`;
      const row = await tx.contentState.findUnique({
        where: { key: 'challenge:' + id },
      });
      const data = row?.value as unknown as Challenge | undefined;
      if (!data || this.hasResult(data, subject) || data.results.length >= 500)
        return;
      data.results.push({ subject, nickname, score, solved });
      await tx.contentState.update({
        where: { key: 'challenge:' + id },
        data: { value: JSON.parse(JSON.stringify(data)) },
      });
    });
  }
}
