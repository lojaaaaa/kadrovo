import { ExperienceService } from './experience.service';
import type { MatchState } from '../game/match';
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
  subject?: string;
  id: string;
  nickname: string;
  ready: boolean;
  tokenHash: string;
  sockets: Set<string>;
};
type Room = {
  disconnectedUntil?: Map<string, number>;
  emptySince?: number;
  dailyDay?: string;
  practiceDay?: string;
  savedDaily?: MatchState;
  challengeId?: string;
  challengeLinks?: Map<string, Promise<string>>;
  sharedAnswer?: boolean;
  tastes?: NonNullable<CreateRoom['tastes']>;
  tasteVotes?: Record<string, NonNullable<CreateRoom['tastes']>>;
  rematchVotes?: Set<string>;
  exposed?: Set<string>;
  progressRevision?: number;
  name: string;
  answerMode: 'search' | 'choices';
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
    @Optional()
    @Inject(ExperienceService)
    private readonly experience?: ExperienceService,
  ) {}
  tick() {
    this.prune();
    this.activity();
    const changed: string[] = [];
    for (const r of this.rooms.values()) {
      for (const [id, deadline] of r.disconnectedUntil ?? []) {
        if (
          deadline <= Date.now() &&
          !r.players.find((p) => p.id === id)?.sockets.size
        ) {
          r.disconnectedUntil!.delete(id);
          this.departure(r, id);
          r.revision++;
          changed.push(r.code);
        }
      }
    }
    for (const r of this.rooms.values())
      if (r.match?.advance(Date.now())) {
        r.revision++;
        changed.push(r.code);
      }
    for (const r of this.rooms.values()) {
      this.queueRating(r);
      this.recordProgress(r);
    }
    void this.flushRatings();
    return changed;
  }
  private queueRating(r: Room, forfeited?: string) {
    if (!r.match || !r.accounts || !r.battlePlayers || r.ratingQueued) return;
    const game = r.match.snapshot(Date.now());
    if (game.phase !== 'finished' && !forfeited) return;
    if (game.termination?.reason === 'aborted') {
      r.ratingQueued = true;
      return;
    }
    if (game.phase === 'finished')
      forfeited =
        game.termination?.reason === 'forfeit'
          ? game.termination.playerId
          : undefined;
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
    if (input.name) r.name = input.name;
    if (input.answerMode) r.answerMode = input.answerMode;
    if (input.sharedAnswer !== undefined) r.sharedAnswer = input.sharedAnswer;
    if (input.tastes) r.tastes = input.tastes;
    r.collection = input.collection ?? r.collection;
    r.category = input.category;
    r.mode = input.mode;
    r.source = input.source ?? r.source;
    r.roundSeconds = input.roundSeconds ?? r.roundSeconds;
    r.totalRounds = input.totalRounds ?? r.totalRounds;
    for (const player of r.players) player.ready = false;
    r.revision++;
  }
  private checkTrial(r: Room, players = r.players) {
    if (r.dailyDay) return;
    for (const subject of new Set(
      players.flatMap((p) => (p.subject ? [p.subject] : [])),
    ))
      this.experience?.assertTrial(
        subject,
        r.format === 'solo' ? 'solo' : 'online',
        r.savedDaily?.id,
      );
  }
  private recordTrial(r: Room) {
    if (!r.match || r.dailyDay) return;
    const matchId = r.match.snapshot(Date.now()).matchId;
    for (const subject of new Set(
      r.players.flatMap((p) => (p.subject ? [p.subject] : [])),
    ))
      this.experience?.useTrial(
        subject,
        r.format === 'solo' ? 'solo' : 'online',
        matchId,
      );
  }
  start(code: string, token: string, force = false) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (id !== r.hostId)
      throw new ConflictException('Запустить партию может только организатор.');
    if (r.format === 'battle')
      throw new ConflictException('Дуэль запускается автоматически.');
    if ((r.dailyDay || r.challengeId) && r.match)
      throw new ConflictException(
        'Результат дня уже сохранён. Повтор доступен как тренировка.',
      );
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
    this.checkTrial(r);
    const votes = Object.values(r.tasteVotes ?? {}).flat();
    if (votes.length) r.tastes = votes;
    r.match = new Match(
      r.dailyDeck ??
        this.catalog.deck(
          r.category,
          r.mode,
          r.source,
          r.collection,
          r.totalRounds,
          {
            seen: this.experience?.seen(
              r.players.flatMap((p) => (p.subject ? [p.subject] : [])),
            ),
            tastes: r.tastes,
          },
        ),
      r.mode,
      r.players,
      Date.now(),
      r.roundSeconds * 1000,
      r.format === 'solo' ? 1000 : 3000,
      r.answerMode,
      this.catalog.options?.(r.category, r.source) ?? [],
      !!r.sharedAnswer,
    );
    r.totalRounds = r.match.snapshot(Date.now()).totalRounds;
    if (r.savedDaily) {
      r.match.restore(r.savedDaily, r.players[0]!.id);
      r.savedDaily = undefined;
    }
    this.recordTrial(r);
    for (const p of r.players) p.ready = false;
    this.experience?.metric('match_started');
    r.revision++;
  }
  answer(code: string, token: string, command: AnswerCommand) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Партия ещё не началась.');
    if (!this.catalog.has(command.titleId, r.category, r.source))
      throw new ConflictException('Выберите название из поиска.');
    if (r.sharedAnswer && id !== r.hostId)
      throw new ConflictException('Общий ответ подтверждает ведущий.');
    const result = r.match.answer(id, command, Date.now());
    r.exposed ??= new Set();
    const commandKey = 'answer:' + command.commandId;
    if (
      !r.exposed.has(commandKey) &&
      (result.status === 'correct' || result.status === 'incorrect')
    ) {
      r.exposed.add(commandKey);
      this.experience?.metric('answer_' + result.status);
    }
    r.revision++;
    this.recordProgress(r);
    return result;
  }
  skip(code: string, token: string, roundId: string) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Партия ещё не началась.');
    if (r.sharedAnswer && id !== r.hostId)
      throw new ConflictException('Подсказки и пропуск выбирает ведущий.');
    r.match.skip(id, roundId, Date.now());
    r.revision++;
    this.recordProgress(r);
  }
  select(code: string, token: string, roundId: string, stage: number) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Партия ещё не началась.');
    if (r.sharedAnswer && id !== r.hostId)
      throw new ConflictException('Подсказки выбирает ведущий.');
    r.match.select(id, roundId, stage, Date.now());
    r.revision++;
    this.recordProgress(r);
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
        (room.format === 'party' &&
          room.emptySince !== undefined &&
          Date.now() - room.emptySince >= 60000) ||
        (room.format === 'battle' &&
          !room.match &&
          (room.battleDeadline ?? Infinity) <= Date.now())
      ) {
        for (const p of room.players)
          if (p.subject) this.experience?.release(p.subject);
        this.rooms.delete(code);
      }
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
  private add(room: Room, nickname: string, subject?: string): RoomSession {
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
      subject,
      nickname,
      ready: false,
      tokenHash: digest(token),
      sockets: new Set<string>(),
    };
    if (subject) this.experience?.retain(subject);
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
        game.termination?.reason === 'aborted' ||
        this.recorded.has(game.matchId)
      )
        continue;
      this.recorded.add(game.matchId);
      const winner =
        game.standings.find((p) => p.playerId === game.termination?.winnerId) ??
        game.standings[0]!;
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
        name: r.name,
        host: r.players.find((p) => p.id === r.hostId)?.nickname ?? 'Игрок',
        players: r.players.length,
        capacity: 8,
        mode: r.mode,
        category: r.category,
      }));
  }
  createQuick(players: { nickname: string; subject?: string }[]) {
    this.catalog.validate?.('movies', 'frames', 'catalog');
    const first = this.create(
      {
        nickname: players[0]!.nickname,
        category: 'movies',
        mode: 'frames',
        source: 'catalog',
        visibility: 'public',
      },
      players[0]?.subject,
    );
    const r = this.room(first.code);
    const sessions = [first];
    for (const [i, p] of players.slice(1).entries())
      sessions.push(
        this.add(r, `${p.nickname.slice(0, 18)} · ${i + 2}`, p.subject),
      );
    r.format = 'battle';
    r.quick = true;
    r.quickCapacity = players.length;
    r.battleDeadline = Date.now() + 60000;
    return sessions;
  }
  create(input: CreateRoom, subject?: string) {
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
      sharedAnswer: input.sharedAnswer,
      tastes: input.tastes
        ? [...new Set(input.tastes)].filter((v) => v !== 'all')
        : undefined,
      name: input.name ?? `Комната ${input.nickname}`,
      answerMode: input.answerMode ?? 'search',
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
    const session = this.add(room, input.nickname, subject);
    room.hostId = session.playerId;
    this.rooms.set(code, room);
    this.experience?.metric('room_created');
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
      totalRounds: 5,
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
    if (accounts) {
      r.players[0]!.subject = 'account:' + accounts[0];
      r.players[1]!.subject = 'account:' + accounts[1];
      for (const p of r.players)
        if (p.subject) this.experience?.retain(p.subject);
    }
    r.battlePlayers = [a.playerId, b.playerId];
    r.battleDeadline = Date.now() + 60_000;
    return [a, b];
  }
  battleAvailable(session: RoomSession) {
    const r = this.rooms.get(session.code);
    if (
      !r ||
      !r.players.some((p) => p.id === session.playerId) ||
      (!r.match && r.players.length !== (r.quickCapacity ?? 2)) ||
      r.match?.snapshot(Date.now()).phase === 'finished'
    )
      return false;
    if (!r.match && (r.battleDeadline ?? 0) < Date.now()) {
      for (const p of r.players)
        if (p.subject) this.experience?.release(p.subject);
      this.rooms.delete(r.code);
      return false;
    }
    return true;
  }
  createDaily(
    question: Question,
    nickname: string,
    subject?: string,
    day?: string,
    training = false,
  ) {
    const progress =
      subject && day && !training
        ? this.experience?.get(subject).daily[day]
        : undefined;
    if (progress?.session && this.rooms.has(progress.session.code)) {
      const player = this.room(progress.session.code).players.find(
        (p) => p.id === progress.session!.playerId,
      );
      if (player && player.subject !== subject) {
        if (player.subject) this.experience?.release(player.subject);
        if (subject) this.experience?.retain(subject);
        player.subject = subject;
      }
      return progress.session;
    }
    const session = this.create(
      {
        format: 'solo',
        nickname,
        category: 'movies',
        mode: 'frames',
        source: 'catalog',
        roundSeconds: 45,
      },
      subject,
    );
    const room = this.room(session.code);
    room.dailyDeck = [question];
    if (training) room.practiceDay = day;
    if (!training) {
      room.dailyDay = day;
      room.savedDaily = progress?.state;
    }
    if (subject && day && !training && this.experience) {
      this.experience.get(subject).daily[day] = { ...progress, session };
      this.experience.save(subject);
    }
    return session;
  }
  private recordProgress(r: Room) {
    if (!r.match || !this.experience) return;
    const game = r.match.snapshot(Date.now());
    if (game.termination?.reason === 'aborted') return;
    r.exposed ??= new Set();
    if (
      game.phase === 'finished' &&
      !r.exposed.has('finished:' + game.matchId)
    ) {
      r.exposed.add('finished:' + game.matchId);
      this.experience.metric('match_finished');
      if (r.sharedAnswer) this.experience.metric('cooperative_finished');
      if (r.tastes?.length) this.experience.metric('taste_finished');
    }
    for (const p of r.players)
      if (p.subject) {
        const key = p.id + ':' + game.roundId;
        if (p.sockets.size && !r.exposed.has(key)) {
          r.exposed.add(key);
          this.experience.expose(
            p.subject,
            r.match.titleIds[game.roundNumber - 1]!,
          );
        }
        if (
          (r.dailyDay || r.challengeId) &&
          r.progressRevision !== r.revision
        ) {
          const personal = r.match.snapshot(Date.now(), p.id);
          const owner = this.experience.get(p.subject);
          const bucket = r.dailyDay ? owner.daily : (owner.challenges ??= {});
          const progressKey = r.dailyDay ?? r.challengeId!;
          const progress = bucket[progressKey] ?? {};
          progress.state = r.match.checkpoint();
          progress.updatedAt = Date.now();
          if (game.phase === 'finished') {
            progress.score = personal.standings[0]?.score ?? 0;
            progress.solved = personal.history?.[0]?.solved ?? false;
          }
          bucket[progressKey] = progress;
          this.experience.save(p.subject);
        }
        if (
          r.challengeId &&
          game.phase === 'finished' &&
          !r.exposed.has('result:' + p.id)
        ) {
          r.exposed.add('result:' + p.id);
          const personal = r.match.snapshot(Date.now(), p.id);
          void this.experience
            .recordChallenge(
              r.challengeId,
              p.subject,
              p.nickname,
              personal.standings.find((v) => v.playerId === p.id)?.score ?? 0,
              personal.history?.filter((v) => v.solved).length ?? 0,
            )
            .catch(() => {
              r.exposed!.delete('result:' + p.id);
            });
        }
      }
    r.progressRevision = r.revision;
  }
  async challenge(code: string, token: string, subject: string) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (r.match?.active || !r.match)
      throw new ConflictException('Вызов доступен после окончания партии.');
    if (!this.experience) throw new ServiceUnavailableException();
    const game = r.match.snapshot(Date.now(), id);
    const key = r.match.id + ':' + id;
    r.challengeLinks ??= new Map();
    const existing = r.challengeLinks.get(key);
    if (existing) return { id: await existing };
    const pending = this.experience.createChallenge({
      titleIds: r.match.titleIds,
      mode: r.mode,
      category: r.category,
      source: r.source,
      answerMode: r.answerMode,
      seconds: r.roundSeconds,
      expiresAt: Date.now() + 7 * 86400000,
      results: [
        {
          subject,
          nickname: r.players.find((p) => p.id === id)!.nickname,
          score: game.standings.find((p) => p.playerId === id)!.score,
          solved: game.history?.filter((p) => p.solved).length ?? 0,
        },
      ],
    });
    r.challengeLinks.set(key, pending);
    try {
      return { id: await pending };
    } catch (error) {
      r.challengeLinks.delete(key);
      throw error;
    }
  }
  async joinChallenge(challengeId: string, subject: string, nickname: string) {
    if (!this.experience || !this.catalog.byIds)
      throw new ServiceUnavailableException();
    const c = await this.experience.challenge(challengeId);
    if (this.experience.hasResult(c, subject))
      throw new ConflictException('Первый результат уже записан.');
    if (c.results.length >= 500)
      throw new ConflictException(
        'В вызове уже 500 результатов. Создайте новый.',
      );
    const owner = this.experience.get(subject);
    owner.challenges ??= {};
    const progress = owner.challenges[challengeId];
    if (progress?.session && this.rooms.has(progress.session.code)) {
      const player = this.room(progress.session.code).players.find(
        (p) => p.id === progress.session!.playerId,
      );
      if (player && player.subject !== subject) {
        if (player.subject) this.experience?.release(player.subject);
        if (subject) this.experience?.retain(subject);
        player.subject = subject;
      }
      return progress.session;
    }
    const questions = this.catalog.byIds(c.titleIds, c.source);
    const session = this.create(
      {
        nickname,
        format: 'solo',
        mode: c.mode,
        category: c.category,
        source: c.source,
        answerMode: c.answerMode,
        roundSeconds: c.seconds as 45,
      },
      subject,
    );
    const room = this.room(session.code);
    room.dailyDeck = questions;
    room.challengeId = challengeId;
    room.savedDaily = progress?.state;
    owner.challenges[challengeId] = { ...progress, session };
    this.experience.save(subject);
    return session;
  }
  tastes(
    code: string,
    token: string,
    tastes: NonNullable<CreateRoom['tastes']>,
  ) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (r.format !== 'party' || r.match?.active)
      throw new ConflictException('Вкус выбирается в лобби.');
    r.tasteVotes ??= {};
    r.tasteVotes[id] = [...new Set(tastes)].filter((v) => v !== 'all');
    r.revision++;
  }
  rematch(code: string, token: string) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match || r.match.active || r.dailyDay || r.challengeId)
      throw new ConflictException('Реванш сейчас недоступен.');
    const minimum =
      r.format === 'solo' ? 1 : r.quick && (r.quickCapacity ?? 2) > 2 ? 3 : 2;
    const active = r.players.filter((p) => p.sockets.size);
    if (active.length < minimum)
      throw new ConflictException(
        `Для новой игры нужны минимум ${minimum} подключённых игрока.`,
      );
    r.rematchVotes ??= new Set();
    r.rematchVotes.add(id);
    r.revision++;
    if (!active.every((p) => r.rematchVotes!.has(p.id))) return;
    this.checkTrial(r, active);
    this.queueRating(r);
    for (const p of r.players)
      if (!active.includes(p) && p.subject) this.experience?.release(p.subject);
    r.players = active;
    if (!active.some((p) => p.id === r.hostId)) r.hostId = active[0]!.id;
    if (r.tasteVotes)
      r.tasteVotes = Object.fromEntries(
        Object.entries(r.tasteVotes).filter(([id]) =>
          active.some((p) => p.id === id),
        ),
      );
    r.ratingQueued = false;
    r.rematchVotes.clear();
    r.match = new Match(
      this.catalog.deck(
        r.category,
        r.mode,
        r.source,
        r.collection,
        r.totalRounds,
        {
          seen: this.experience?.seen(
            r.players.flatMap((p) => (p.subject ? [p.subject] : [])),
          ),
          tastes: r.tastes,
        },
      ),
      r.mode,
      active,
      Date.now(),
      r.roundSeconds * 1000,
      3000,
      r.answerMode,
      this.catalog.options?.(r.category, r.source) ?? [],
      !!r.sharedAnswer,
    );
    this.recordTrial(r);
  }
  report(code: string, token: string, reason: string) {
    const id = this.authenticate(code, token),
      r = this.room(code);
    if (!r.match) throw new ConflictException('Игра не началась.');
    const game = r.match.snapshot(Date.now(), id);
    return {
      titleId: r.match.titleIds[game.roundNumber - 1]!,
      stage: game.stage,
      mode: game.mode,
      reason,
    };
  }
  join(code: string, nickname: string, subject?: string) {
    return this.add(this.room(code), nickname, subject);
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
    this.recordProgress(r);
    return {
      name: r.name,
      sharedAnswer: r.sharedAnswer,
      tastes: r.tastes,
      tasteVotes: r.tasteVotes,
      dailyDay: r.dailyDay,
      practiceDay: r.practiceDay,
      challengeId: r.challengeId,
      rematchVotes: [...(r.rematchVotes ?? [])],
      answerMode: r.answerMode,
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
      ranked: !!r.accounts,
      minimumPlayers:
        r.format === 'solo' ? 1 : r.quick && (r.quickCapacity ?? 2) > 2 ? 3 : 2,
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
    if (!r.match && (r.format === 'solo' || r.format === 'battle'))
      this.checkTrial(r);
    r.players.find((p) => p.id === id)!.sockets.add(socketId);
    r.disconnectedUntil?.delete(id);
    r.emptySince = undefined;
    if (
      r.format === 'battle' &&
      !r.match &&
      r.players.length === (r.quickCapacity ?? 2) &&
      r.players.every((p) => p.sockets.size)
    ) {
      this.checkTrial(r);
      r.match = new Match(
        this.catalog.deck(
          r.category,
          r.mode,
          r.source,
          r.collection,
          r.totalRounds,
          {
            seen: this.experience?.seen(
              r.players.flatMap((p) => (p.subject ? [p.subject] : [])),
            ),
            tastes: r.tastes,
          },
        ),
        r.mode,
        r.players,
        Date.now(),
        r.roundSeconds * 1000,
        3000,
        r.answerMode,
        this.catalog.options?.(r.category, r.source) ?? [],
        !!r.sharedAnswer,
      );
      this.recordTrial(r);
    }
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
    if (!p.sockets.size) {
      p.ready = false;
      r.rematchVotes?.delete(p.id);
      if (
        r.format === 'battle' &&
        (r.quickCapacity ?? 2) === 2 &&
        r.match?.active
      )
        (r.disconnectedUntil ??= new Map()).set(p.id, Date.now() + 15000);
    }
    if (
      r.format === 'party' &&
      r.players.every((player) => !player.sockets.size)
    )
      r.emptySince ??= Date.now();
    r.revision++;
  }
  ready(code: string, token: string, ready: boolean) {
    const id = this.authenticate(code, token);
    const r = this.room(code);
    if (r.match?.active)
      throw new ConflictException('Готовность меняется между партиями.');
    const player = r.players.find((p) => p.id === id)!;
    if (ready && player.subject)
      this.experience?.assertTrial(player.subject, 'online');
    player.ready = ready;
    r.revision++;
  }
  private departure(r: Room, id: string) {
    if (r.format === 'battle' && (r.quickCapacity ?? 2) === 2)
      r.match?.finishDeparture(id, Date.now());
    else r.match?.leave(id, Date.now());
    this.queueRating(r, id);
  }
  leave(code: string, token: string) {
    const id = this.authenticate(code, token);
    const r = this.room(code);
    r.disconnectedUntil?.delete(id);
    this.departure(r, id);
    void this.flushRatings();
    r.rematchVotes?.delete(id);
    const leaving = r.players.find((p) => p.id === id);
    if (leaving?.subject) this.experience?.release(leaving.subject);
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
    if (removed?.subject) this.experience?.release(removed.subject);
    r.revision++;
    return removed;
  }
}
