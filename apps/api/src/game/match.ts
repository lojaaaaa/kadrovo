import { randomUUID, randomInt } from 'node:crypto';
import type {
  AnswerCommand,
  CreateRoom,
  GamePersonal,
  GameSnapshot,
  TitleOption,
} from '@filmless/contracts';
import type { Question } from './catalog';
import { PlayerRound, type Result } from './round';
type Participant = {
  playerId: string;
  nickname: string;
  score: number;
  roundScore: number;
  solved: boolean;
  expired: boolean;
  wrong: boolean;
  attempts: PlayerRound;
  nextAllowedAt: number;
  finishOrder?: number;
};
export class Match {
  id = randomUUID();
  private roundId = randomUUID();
  private index = 0;
  private phase: GameSnapshot['phase'] = 'playing';
  private startedAt: number;
  private endsAt: number;
  private nextAt: number;
  private stage = 0;
  private players: Participant[];
  private choiceRounds = new Map<number, TitleOption[]>();
  private departed = new Set<string>();
  private termination?: GameSnapshot['termination'];
  private reviews = new Map<string, NonNullable<GameSnapshot['history']>>();
  private archived = new Set<number>();
  private archive() {
    if (this.archived.has(this.index)) return;
    this.archived.add(this.index);
    for (const p of this.players) {
      const history = this.reviews.get(p.playerId) ?? [];
      history.push({
        title: this.deck[this.index]!.title,
        score: p.roundScore,
        solved: p.solved,
        hints: p.attempts.openedStage,
      });
      this.reviews.set(p.playerId, history);
    }
  }
  get titleIds() {
    return this.deck.map((q) => q.title.id);
  }
  get questions() {
    return this.deck;
  }

  constructor(
    private readonly deck: Question[],
    private readonly mode: CreateRoom['mode'],
    players: { id: string; nickname: string }[],
    now: number,
    private readonly roundMs = 45_000,
    private readonly revealMs = 3_000,
    private readonly answerMode: 'search' | 'choices' = 'search',
    private readonly choicePool: TitleOption[] = [],
    private readonly cooperative = false,
  ) {
    if (!deck.length || roundMs <= 0 || revealMs <= 0)
      throw new Error('Invalid match settings');
    if (
      answerMode === 'choices' &&
      deck.some(
        (q) =>
          new Set(
            [
              q.title,
              ...choicePool.filter((t) => t.category === q.title.category),
            ].map((t) => t.name.toLocaleLowerCase('ru')),
          ).size < 4,
      )
    )
      throw new Error('Для выбора нужны четыре разных названия в категории.');
    this.startedAt = now;
    this.endsAt = now + roundMs;
    this.nextAt = this.endsAt + revealMs;
    this.players = players.map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      score: 0,
      roundScore: 0,
      solved: false,
      expired: false,
      wrong: false,
      nextAllowedAt: 0,
      attempts: new PlayerRound(deck[0]!.title.id, now, this.endsAt),
    }));
  }
  private choices() {
    if (this.answerMode !== 'choices') return undefined;
    let options = this.choiceRounds.get(this.index);
    if (!options) {
      const correct = this.deck[this.index]!.title;
      const seen = new Set([correct.id]);
      const names = new Set([correct.name.toLocaleLowerCase('ru')]);
      const candidates = this.choicePool.filter(
        (t) => t.category === correct.category && t.id !== correct.id,
      );
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
      }
      candidates.sort((a, b) => {
        const distance = (t: TitleOption) =>
          t.year !== null && correct.year !== null
            ? Math.floor(Math.abs(t.year - correct.year) / 5)
            : 1000;
        const overlap = (t: TitleOption) =>
          (t.genres ?? []).filter((g) => correct.genres?.includes(g)).length;
        return (
          Number(overlap(b) > 0) - Number(overlap(a) > 0) ||
          distance(a) - distance(b)
        );
      });
      options = [correct];
      for (const t of candidates) {
        if (seen.has(t.id) || names.has(t.name.toLocaleLowerCase('ru')))
          continue;
        options.push(t);
        seen.add(t.id);
        names.add(t.name.toLocaleLowerCase('ru'));
        if (options.length === 4) break;
      }
      if (options.length !== 4)
        throw new Error('Для выбора нужны четыре разных названия в категории.');
      for (let i = options.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [options[i], options[j]] = [options[j]!, options[i]!];
      }
      this.choiceRounds.set(this.index, options);
    }
    return options;
  }
  checkpoint() {
    return {
      id: this.id,
      roundId: this.roundId,
      index: this.index,
      phase: this.phase,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      nextAt: this.nextAt,
      players: this.players.map((p) => ({
        ...p,
        attempts: p.attempts.checkpoint(),
      })),
      reviews: [...this.reviews],
      archived: [...this.archived],
      choices: [...this.choiceRounds],
    };
  }
  restore(state: MatchState, playerId: string) {
    if (
      state.players.length !== 1 ||
      state.index < 0 ||
      state.index >= this.deck.length
    )
      throw new Error('Invalid saved match');
    this.id = state.id;
    this.roundId = state.roundId;
    this.index = state.index;
    this.phase = state.phase;
    this.startedAt = state.startedAt;
    this.endsAt = state.endsAt;
    this.nextAt = state.nextAt;
    const old = state.players[0]!;
    const attempts = new PlayerRound(
      this.deck[this.index]!.title.id,
      this.startedAt,
      Math.max(this.startedAt + 1, this.endsAt),
    );
    attempts.restore(old.attempts);
    this.players = [{ ...old, playerId, attempts }];
    this.reviews = new Map([
      [
        playerId,
        (state.reviews[0]?.[1] ?? []).map((review, i) => ({
          ...review,
          title: this.deck[i]?.title ?? review.title,
        })),
      ],
    ]);
    this.archived = new Set(state.archived);
    this.choiceRounds = new Map(state.choices);
  }
  get active() {
    return this.phase !== 'finished';
  }
  advance(now: number): boolean {
    const state = () =>
      `${this.index}:${this.phase}:${this.stage}:${this.players.map((p) => p.expired).join(',')}`;
    const before = state();
    if (this.phase === 'playing') {
      for (const p of this.players)
        p.expired = !p.solved && now >= p.attempts.deadline;
      if (
        now < this.endsAt &&
        this.players
          .filter((p) => !this.departed.has(p.playerId))
          .every((p) => p.solved || p.expired)
      ) {
        this.phase = 'reveal';
        this.stage = 4;
        this.nextAt = now + this.revealMs;
      }
    }
    while (
      this.phase !== 'finished' &&
      (this.phase === 'reveal' || now >= this.endsAt)
    ) {
      this.phase = 'reveal';
      this.stage = 4;
      this.archive();
      if (now < this.nextAt) break;
      if (this.index === this.deck.length - 1) {
        this.phase = 'finished';
        break;
      }
      this.index++;
      this.startedAt = this.nextAt;
      this.endsAt = this.startedAt + this.roundMs;
      this.nextAt = this.endsAt + this.revealMs;
      this.phase = 'playing';
      this.roundId = randomUUID();
      for (const p of this.players) {
        p.finishOrder = undefined;
        p.roundScore = 0;
        p.solved = false;
        p.expired = false;
        p.wrong = false;
        p.nextAllowedAt = 0;
        p.attempts = new PlayerRound(
          this.deck[this.index]!.title.id,
          this.startedAt,
          this.endsAt,
        );
      }
    }
    return before !== state();
  }
  skip(playerId: string, roundId: string, now: number) {
    this.advance(now);
    const p = this.players.find((p) => p.playerId === playerId);
    if (!p || this.departed.has(playerId) || roundId !== this.roundId)
      throw new Error('Этот раунд уже закончился.');
    if (this.phase !== 'playing') return;
    for (const target of this.cooperative
      ? this.players.filter((v) => !this.departed.has(v.playerId))
      : [p])
      target.attempts.skip(now);
    this.advance(now);
  }
  select(playerId: string, roundId: string, stage: number, now: number) {
    this.advance(now);
    const p = this.players.find((p) => p.playerId === playerId);
    if (
      !p ||
      this.departed.has(playerId) ||
      roundId !== this.roundId ||
      this.phase !== 'playing'
    )
      throw new Error('Раунд уже завершён.');
    for (const target of this.cooperative
      ? this.players.filter((v) => !this.departed.has(v.playerId))
      : [p])
      target.attempts.select(stage, now);
    this.advance(now);
  }

  answer(playerId: string, command: AnswerCommand, now: number): Result {
    this.advance(now);
    const p = this.players.find((p) => p.playerId === playerId);
    if (!p) throw new Error('Вы не участвуете в этой партии.');
    if (command.roundId !== this.roundId)
      throw new Error('Этот раунд уже закончился.');
    if (this.phase !== 'playing')
      return { status: 'finished', score: 0, nextAllowedAt: p.nextAllowedAt };
    if (
      this.answerMode === 'choices' &&
      !this.choices()?.some((t) => t.id === command.titleId)
    )
      throw new Error('Выберите один из четырёх вариантов.');
    const result = p.attempts.answer({ ...command, receivedAt: now });
    if (result.status === 'correct' && !p.solved) {
      const earlier = this.players.filter((player) => player.solved).length;
      p.finishOrder = earlier + 1;
      const previous = this.players.find(
        (player) => player.finishOrder === earlier,
      );
      result.score = Math.max(
        1,
        Math.min(
          result.score - earlier * 2,
          previous ? previous.roundScore - 2 : 20,
        ),
      );
      p.solved = true;
      p.score += result.score;
      p.roundScore = result.score;
    }
    if (
      this.answerMode === 'choices' &&
      result.status === 'incorrect' &&
      !p.wrong
    ) {
      p.wrong = true;
      p.expired = true;
      p.roundScore = -4;
      p.score -= 4;
      result.score = -4;
      p.attempts.finish(now);
    }
    p.nextAllowedAt = result.nextAllowedAt;
    if (
      this.cooperative &&
      (result.status === 'correct' ||
        (this.answerMode === 'choices' && result.status === 'incorrect'))
    )
      for (const other of this.players) {
        if (other === p || this.departed.has(other.playerId)) continue;
        other.attempts.answer({ ...command, receivedAt: now });
        other.solved = p.solved;
        other.wrong = p.wrong;
        other.expired = p.expired;
        other.roundScore = p.roundScore;
        other.score += p.roundScore;
        if (p.wrong) other.attempts.finish(now);
      }

    if (
      this.players
        .filter((player) => !this.departed.has(player.playerId))
        .every((player) => player.solved || player.expired)
    ) {
      this.nextAt = now + this.revealMs;
      this.phase = 'reveal';
      this.stage = 4;
    }
    return result;
  }
  finishDeparture(playerId: string, now: number) {
    this.advance(now);
    if (
      this.phase === 'finished' ||
      !this.players.some((p) => p.playerId === playerId)
    )
      return;
    const aborted =
      this.index === 0 && this.players.every((p) => p.score === 0);
    this.termination = {
      reason: aborted ? 'aborted' : 'forfeit',
      playerId,
      ...(!aborted
        ? {
            winnerId: this.players.find((p) => p.playerId !== playerId)
              ?.playerId,
          }
        : {}),
    };
    if (!aborted) this.archive();
    this.phase = 'finished';
    this.stage = 4;
    this.nextAt = now;
    this.departed.add(playerId);
  }
  leave(playerId: string, now: number) {
    this.advance(now);
    this.departed.add(playerId);
    const remaining = this.players.filter(
      (player) => !this.departed.has(player.playerId),
    );
    if (
      this.phase === 'playing' &&
      remaining.length &&
      remaining.every((player) => player.solved || player.expired)
    ) {
      this.nextAt = now + this.revealMs;
      this.phase = 'reveal';
      this.stage = 4;
    }
  }
  personal(playerId: string): GamePersonal {
    const p = this.players.find((p) => p.playerId === playerId);
    return {
      roundId: this.roundId,
      solved: p?.solved ?? false,
      nextAllowedAt: p?.nextAllowedAt ?? 0,
    };
  }
  snapshot(now: number, playerId?: string): GameSnapshot {
    const personal = this.players.find((p) => p.playerId === playerId);
    const stage =
      this.phase === 'playing' ? (personal?.attempts.selectedStage ?? 0) : 4;
    const q = this.deck[this.index]!;
    const mode =
      this.mode === 'mix'
        ? this.index % 2 === 0
          ? 'frames'
          : 'spotlight'
        : this.mode;
    return {
      termination: this.termination,
      sharedAnswer: this.cooperative,
      answerMode: this.answerMode,
      ...(this.answerMode === 'choices'
        ? {
            choices: this.choices()?.map(({ id, name, year, category }) => ({
              id,
              name,
              year,
              category,
            })),
          }
        : {}),
      history:
        this.phase === 'finished'
          ? (this.reviews.get(playerId ?? '') ?? [])
          : undefined,
      matchId: this.id,
      roundId: this.roundId,
      phase: this.phase,
      roundNumber: this.index + 1,
      totalRounds: this.deck.length,
      mode,
      stage,
      unlockedStage: personal?.attempts.openedStage ?? 0,
      possibleScore: personal?.attempts.possibleScore ?? 20,
      personalWrong: personal?.wrong ?? false,
      personalSkipped: personal?.attempts.skipped ?? false,
      personalExpired: personal?.expired ?? false,
      roundDurationMs: this.roundMs,
      startedAt: this.startedAt,
      endsAt:
        this.phase === 'playing'
          ? (personal?.attempts.deadline ?? this.endsAt)
          : this.endsAt,
      nextAt: this.nextAt,
      serverNow: now,
      demo: q.demo !== false,
      image: (q[mode] ?? q.frames)[stage]!,
      ...(this.phase === 'playing' ? {} : { answer: q.title }),
      standings: this.players
        .map(
          ({
            playerId,
            nickname,
            score,
            roundScore,
            solved,
            attempts,
            expired,
            wrong,
            finishOrder,
          }) => ({
            playerId,
            nickname,
            score,
            roundScore,
            solved,
            deadline: attempts.deadline,
            expired,
            skipped: attempts.skipped,
            wrong,
            finishOrder,
          }),
        )
        .sort((a, b) => b.score - a.score),
    };
  }
}

export type MatchState = ReturnType<Match['checkpoint']>;
