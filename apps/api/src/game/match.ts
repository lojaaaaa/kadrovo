import { randomUUID } from 'node:crypto';
import type {
  AnswerCommand,
  CreateRoom,
  GamePersonal,
  GameSnapshot,
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
  attempts: PlayerRound;
  nextAllowedAt: number;
};
export class Match {
  readonly id = randomUUID();
  private roundId = randomUUID();
  private index = 0;
  private phase: GameSnapshot['phase'] = 'playing';
  private startedAt: number;
  private endsAt: number;
  private nextAt: number;
  private stage = 0;
  private players: Participant[];
  private departed = new Set<string>();
  constructor(
    private readonly deck: Question[],
    private readonly mode: CreateRoom['mode'],
    players: { id: string; nickname: string }[],
    now: number,
    private readonly roundMs = 45_000,
    private readonly revealMs = 3_000,
  ) {
    if (!deck.length || roundMs <= 0 || revealMs <= 0)
      throw new Error('Invalid match settings');
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
      nextAllowedAt: 0,
      attempts: new PlayerRound(deck[0]!.title.id, now, this.endsAt),
    }));
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
        p.roundScore = 0;
        p.solved = false;
        p.expired = false;
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
    p.attempts.skip(now);
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
    p.attempts.select(stage, now);
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
    const result = p.attempts.answer({ ...command, receivedAt: now });
    if (result.status === 'correct' && !p.solved) {
      p.solved = true;
      p.score += result.score;
      p.roundScore = result.score;
    }
    p.nextAllowedAt = result.nextAllowedAt;
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
      matchId: this.id,
      roundId: this.roundId,
      phase: this.phase,
      roundNumber: this.index + 1,
      totalRounds: this.deck.length,
      mode,
      stage,
      unlockedStage: personal?.attempts.openedStage ?? 0,
      possibleScore: personal?.attempts.possibleScore ?? 20,
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
        .map(({ playerId, nickname, score, roundScore, solved }) => ({
          playerId,
          nickname,
          score,
          roundScore,
          solved,
        }))
        .sort((a, b) => b.score - a.score),
    };
  }
}
