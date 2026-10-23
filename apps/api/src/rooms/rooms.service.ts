import { RatingService, type BattleOutcome } from './rating.service';
import {
  Injectable,
  Optional,
  Logger,
  Inject,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  CreateRoom,
  RoomSettings,
  AnswerCommand,
  RoomSnapshot,
  RoomSession,
} from '@filmless/contracts';
import { DemoCatalog, type Question } from '../game/catalog';
import { ContentCatalog, type GameCatalog } from '../content/catalog';
import { Match } from '../game/match';
type Player = {
  id: string;
  nickname: string;
  ready: boolean;
  tokenHash: string;
  sockets: Set<string>;
};
type Room = {
  visibility: 'public' | 'private';
  quick?: boolean;
  quickCapacity?: number;
  format: 'party' | 'solo' | 'battle';
  battleDeadline?: number;
  accounts?: [string, string];
  battlePlayers?: [string, string];
  ratingQueued?: boolean;
  dailyDeck?: Question[];
  collection: NonNullable<CreateRoom['collection']>;
  roundSeconds: number;
  totalRounds: number;
  code: string;
  category: CreateRoom['category'];
  mode: CreateRoom['mode'];
  source: 'demo' | 'catalog';
  hostId: string;
  revision: number;
  players: Player[];
  expiresAt: number;
  match?: Match;
};
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class RoomsService {
  private pendingRatings = new Map<string, BattleOutcome>();
  private savingRatings = false;
  private ratingRetryAt = 0;
  private logger = new Logger(RoomsService.name);
  private rooms = new Map<string, Room>();
  constructor(
    @Inject(ContentCatalog)
    private readonly catalog: GameCatalog = new DemoCatalog(),
    @Optional() @Inject(RatingService) private readonly ratings?: RatingService,
  ) {}
  tick() {
    this.prune();
    this.activity();
    const changed: string[] = [];
    for (const r of this.rooms.values())
      if (r.match?.advance(Date.now())) {
        r.revision++;
        changed.push(r.code);
      }
    for (const r of this.rooms.values()) this.queueRating(r);
    void this.flushRatings();
    return changed;
  }
  private queueRating(r: Room, forfeited?: string) {
    if (!r.match || !r.accounts || !r.battlePlayers || r.ratingQueued) return;
    const game = r.match.snapshot(Date.now());
    if (game.phase !== 'finished' && !forfeited) return;
    if (game.phase === 'finished') forfeited = undefined;
    const score = (id: string) =>
      forfeited
        ? id === forfeited
          ? 0
          : 1
        : game.standings.find((p) => p.playerId === id)!.score;
    this.pendingRatings.set(r.match.id, {
      matchId: r.match.id,
      firstId: r.accounts[0],
      secondId: r.accounts[1],
      firstScore: score(r.battlePlayers[0]),
      secondScore: score(r.battlePlayers[1]),
    });
    r.ratingQueued = true;
  }
  private async flushRatings() {
    if (!this.ratings || this.savingRatings || Date.now() < this.ratingRetryAt)
      return;
    this.savingRatings = true;
    try {
      for (const [id, result] of this.pendingRatings) {
        await this.ratings.record(result);
        this.pendingRatings.delete(id);
      }
    } catch {
      this.ratingRetryAt = Date.now() + 5000;
      this.logger.warn('Результат батла ожидает повторного сохранения.');
    } finally {
      this.savingRatings = false;
    }
  }
  settings(code: string, token: string, input: RoomSettings) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (id !== r.hostId || r.format !== 'party' || r.match?.active)
      throw new ConflictException(
        'Настройки меняет организатор между партиями.',
      );
    (
      this.catalog.validate?.bind(this.catalog) ??
      this.catalog.deck.bind(this.catalog)
    )(
      input.category,
      input.mode,
      input.source ?? r.source,
      input.collection ?? r.collection,
    );
    r.collection = input.collection ?? r.collection;
    r.category = input.category;
    r.mode = input.mode;
    r.source = input.source ?? r.source;
    r.roundSeconds = input.roundSeconds ?? r.roundSeconds;
    r.totalRounds = input.totalRounds ?? r.totalRounds;
    for (const player of r.players) player.ready = false;
    r.revision++;
  }
  start(code: string, token: string, force = false) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (id !== r.hostId)
      throw new ConflictException('Запустить партию может только организатор.');
    if (r.format === 'battle')
      throw new ConflictException('Дуэль запускается автоматически.');
    if (r.match?.active) throw new ConflictException('Партия уже идёт.');
    const connectedPlayers = r.players.filter((p) => p.sockets.size > 0);
    if (connectedPlayers.length < (r.format === 'solo' ? 1 : 2))
      throw new ConflictException(
        r.format === 'solo'
          ? 'Подключитесь для старта тренировки.'
          : 'Нужны хотя бы двое подключённых игроков.',
      );
    if (
      !force &&
      r.format !== 'solo' &&
      r.players.some((p) => !p.ready || !p.sockets.size)
    )
      throw new ConflictException(
        'Нужны хотя бы двое игроков. Все должны быть в сети и готовы.',
      );
    r.match = new Match(
      r.dailyDeck ??
        this.catalog.deck(
          r.category,
          r.mode,
          r.source,
          r.collection,
          ...(r.totalRounds && r.totalRounds !== 3 ? [r.totalRounds] : []),
        ),
      r.mode,
      r.players,
      Date.now(),
      r.roundSeconds * 1000,
      r.format === 'solo' ? 1000 : 3000,
    );
    for (const p of r.players) p.ready = false;
    r.revision++;
  }
  answer(code: string, token: string, command: AnswerCommand) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Партия ещё не началась.');
    if (!this.catalog.has(command.titleId, r.category, r.source))
      throw new ConflictException('Выберите название из поиска.');
    const result = r.match.answer(id, command, Date.now());
    r.revision++;
    return result;
  }
  skip(code: string, token: string, roundId: string) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Партия ещё не началась.');
    r.match.skip(id, roundId, Date.now());
    r.revision++;
  }
  select(code: string, token: string, roundId: string, stage: number) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Партия ещё не началась.');
    r.match.select(id, roundId, stage, Date.now());
    r.revision++;
  }
  personal(code: string, token: string) {
    const id = this.authenticate(code, token);
    return this.room(code).match?.personal(id) ?? null;
  }
  search(code: string, token: string, query: string) {
    this.authenticate(code, token);
    const room = this.room(code);
    return this.catalog.search(room.category, query, room.source);
  }

  private prune() {
    for (const [code, room] of this.rooms)
      if (
        room.expiresAt <= Date.now() ||
        (room.format === 'battle' &&
          !room.match &&
          (room.battleDeadline ?? Infinity) <= Date.now())
      )
        this.rooms.delete(code);
  }
  private room(code: string) {
    this.prune();
    const room = this.rooms.get(code);
    if (!room)
      throw new NotFoundException(
        'Комната не найдена или срок её действия истёк.',
      );
    return room;
  }
  private add(room: Room, nickname: string): RoomSession {
    if (room.match?.active)
      throw new ConflictException(
        'Партия уже идёт. Войти можно после её окончания.',
      );
    if (room.format === 'solo' && room.players.length)
      throw new ConflictException(
        'Это одиночная тренировка. Создайте свою игру.',
      );
    if (room.format === 'battle')
      throw new ConflictException('Дуэль доступна только подобранным игрокам.');
    if (room.players.length >= 8)
      throw new ConflictException('В комнате уже 8 игроков.');
    if (
      room.players.some(
        (p) =>
          p.nickname.toLocaleLowerCase('ru') ===
          nickname.toLocaleLowerCase('ru'),
      )
    )
      throw new ConflictException('Этот ник уже занят в комнате.');
    const token = randomBytes(32).toString('hex');
    const player = {
      id: randomUUID(),
      nickname,
      ready: false,
      tokenHash: digest(token),
      sockets: new Set<string>(),
    };
    room.players.push(player);
    room.revision++;
    return { code: room.code, token, playerId: player.id };
  }
  private recent: {
    id: string;
    nickname: string;
    score: number;
    players: number;
    finishedAt: number;
  }[] = [];
  private recorded = new Set<string>();
  activity() {
    for (const room of this.rooms.values()) {
      const game = room.match?.snapshot(Date.now());
      if (
        room.visibility !== 'public' ||
        !game ||
        game.phase !== 'finished' ||
        this.recorded.has(game.matchId)
      )
        continue;
      this.recorded.add(game.matchId);
      const winner = game.standings[0]!;
      this.recent.unshift({
        id: game.matchId,
        nickname: winner.nickname,
        score: winner.score,
        players: game.standings.length,
        finishedAt: Date.now(),
      });
      this.recent = this.recent.slice(0, 30);
      if (this.recorded.size > 500)
        this.recorded.delete(this.recorded.values().next().value!);
    }
    return this.recent;
  }
  directory() {
    this.prune();
    return [...this.rooms.values()]
      .filter(
        (r) =>
          r.visibility === 'public' &&
          r.format === 'party' &&
          !r.quick &&
          r.players.length &&
          !r.match?.active,
      )
      .map((r) => ({
        code: r.code,
        host: r.players.find((p) => p.id === r.hostId)?.nickname ?? 'Игрок',
        players: r.players.length,
        capacity: 8,
        mode: r.mode,
        category: r.category,
      }));
  }
  createQuick(players: { nickname: string }[]) {
    this.catalog.validate?.('movies', 'frames', 'catalog');
    const first = this.create({
      nickname: players[0]!.nickname,
      category: 'movies',
      mode: 'frames',
      source: 'catalog',
      visibility: 'public',
    });
    const r = this.room(first.code);
    const sessions = [first];
    for (const [i, p] of players.slice(1).entries())
      sessions.push(this.add(r, `${p.nickname.slice(0, 18)} · ${i + 2}`));
    r.format = 'battle';
    r.quick = true;
    r.quickCapacity = players.length;
    r.battleDeadline = Date.now() + 60000;
    return sessions;
  }
  create(input: CreateRoom) {
    this.prune();
    if (this.rooms.size >= 200)
      throw new ServiceUnavailableException(
        'Сейчас слишком много комнат. Попробуйте позже.',
      );
    let code: string;
    do {
      code = randomBytes(4).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      visibility: input.visibility ?? 'private',
      format: input.format ?? 'party',
      collection: input.collection ?? 'all',
      roundSeconds: input.roundSeconds ?? 45,
      totalRounds: input.totalRounds ?? 3,
      category: input.category,
      mode: input.mode,
      source: input.source ?? 'demo',
      hostId: '',
      revision: 0,
      players: [],
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    };
    const session = this.add(room, input.nickname);
    room.hostId = session.playerId;
    this.rooms.set(code, room);
    return session;
  }
  createBattle(
    first: string,
    second: string,
    accounts?: [string, string],
  ): [RoomSession, RoomSession] {
    // Validate the deck before reserving a room or removing either queue entry.
    (
      this.catalog.validate?.bind(this.catalog) ??
      this.catalog.deck.bind(this.catalog)
    )('movies', 'frames', 'catalog');
    const a = this.create({
      nickname: first,
      category: 'movies',
      mode: 'frames',
      source: 'catalog',
      roundSeconds: 45,
    });
    const r = this.room(a.code);
    const b = this.add(
      r,
      second.toLocaleLowerCase('ru') === first.toLocaleLowerCase('ru')
        ? `${second.slice(0, 20)} · 2`
        : second,
    );
    r.format = 'battle';
    r.accounts = accounts;
    r.battlePlayers = [a.playerId, b.playerId];
    r.battleDeadline = Date.now() + 60_000;
    return [a, b];
  }
  battleAvailable(session: RoomSession) {
    const r = this.rooms.get(session.code);
    if (
      !r ||
      !r.players.some((p) => p.id === session.playerId) ||
      r.match?.snapshot(Date.now()).phase === 'finished'
    )
      return false;
    if (!r.match && (r.battleDeadline ?? 0) < Date.now()) {
      this.rooms.delete(r.code);
      return false;
    }
    return true;
  }
  createDaily(question: Question, nickname: string) {
    const session = this.create({
      format: 'solo',
      nickname,
      category: 'movies',
      mode: 'frames',
      source: 'catalog',
      roundSeconds: 45,
    });
    this.room(session.code).dailyDeck = [question];
    return session;
  }
  join(code: string, nickname: string) {
    return this.add(this.room(code), nickname);
  }
  authenticate(code: string, token: string) {
    const room = this.room(code);
    const player = room.players.find((p) => p.tokenHash === digest(token));
    if (!player)
      throw new UnauthorizedException(
        'Сессия игрока недействительна. Войдите снова.',
      );
    return player.id;
  }
  snapshot(code: string, token?: string): RoomSnapshot {
    const r = this.room(code);
    return {
      code: r.code,
      format: r.format,
      collection: r.collection,
      roundSeconds: r.roundSeconds,
      totalRounds: r.totalRounds,
      category: r.category,
      mode: r.mode,
      source: r.source,
      hostId: r.hostId,
      revision: r.revision,
      capacity:
        r.format === 'solo'
          ? 1
          : r.format === 'battle'
            ? r.quick
              ? r.players.length
              : 2
            : 8,
      expiresAt: r.expiresAt,
      ...(r.match
        ? {
            game: r.match.snapshot(
              Date.now(),
              token ? this.authenticate(code, token) : undefined,
            ),
          }
        : {}),
      players: r.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        ready: p.ready,
        connected: p.sockets.size > 0,
      })),
    };
  }
  connect(code: string, token: string, socketId: string) {
    const id = this.authenticate(code, token);
    const r = this.room(code);
    if (
      r.format === 'battle' &&
      !r.match &&
      (r.battleDeadline ?? 0) < Date.now()
    )
      throw new ConflictException(
        'Время подключения истекло. Найдите нового соперника.',
      );
    r.players.find((p) => p.id === id)!.sockets.add(socketId);
    if (
      r.format === 'battle' &&
      !r.match &&
      r.players.length === (r.quickCapacity ?? 2) &&
      r.players.every((p) => p.sockets.size)
    )
      r.match = new Match(
        this.catalog.deck(r.category, r.mode, r.source, r.collection),
        r.mode,
        r.players,
        Date.now(),
        r.roundSeconds * 1000,
      );
    if (r.format === 'solo' && !r.match) this.start(code, token);
    r.revision++;
    return id;
  }
  disconnect(code: string, socketId: string) {
    const r = this.rooms.get(code);
    if (!r) return;
    const p = r.players.find((p) => p.sockets.has(socketId));
    if (!p) return;
    p.sockets.delete(socketId);
    if (!p.sockets.size) p.ready = false;
    r.revision++;
  }
  ready(code: string, token: string, ready: boolean) {
    const id = this.authenticate(code, token);
    const r = this.room(code);
    if (r.match?.active)
      throw new ConflictException('Готовность меняется между партиями.');
    r.players.find((p) => p.id === id)!.ready = ready;
    r.revision++;
  }
  leave(code: string, token: string) {
    const id = this.authenticate(code, token);
    const r = this.room(code);
    this.queueRating(r, id);
    void this.flushRatings();
    r.match?.leave(id, Date.now());
    r.players = r.players.filter((p) => p.id !== id);
    r.revision++;
    if (!r.players.length) this.rooms.delete(code);
    else if (r.hostId === id) r.hostId = r.players[0]!.id;
  }
  kick(
    code: string,
    token: string,
    targetPlayerId: string,
  ): Player | undefined {
    const id = this.authenticate(code, token);
    const r = this.room(code);
    if (id !== r.hostId)
      throw new ConflictException('Удалять игроков может только организатор.');
    if (r.match?.active)
      throw new ConflictException('Нельзя удалять игроков во время партии.');
    if (targetPlayerId === id)
      throw new ConflictException('Организатор не может удалить сам себя.');
    const index = r.players.findIndex((p) => p.id === targetPlayerId);
    if (index === -1) return undefined;
    const [removed] = r.players.splice(index, 1);
    r.revision++;
    return removed;
  }
}
