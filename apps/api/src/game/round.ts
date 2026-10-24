import { ANSWER_COOLDOWN_MS } from '@filmless/contracts';
export type Attempt = {
  commandId: string;
  titleId: string;
  receivedAt: number;
};
export type Result = {
  status: 'correct' | 'incorrect' | 'cooldown' | 'finished' | 'already-correct';
  score: number;
  nextAllowedAt: number;
};
/** One instance per player and round; timestamps are supplied by the server, never the client. */
export class PlayerRound {
  private results = new Map<string, Result>();
  private nextAllowedAt = 0;
  private solved = false;
  private stage = 0;
  private opened = 0;
  skipped = false;
  skip(now: number) {
    if (now < this.startedAt || this.solved || now >= this.endsAt) return;
    this.skipped = true;
    this.endsAt = now;
  }
  finish(now: number) {
    if (now >= this.startedAt && !this.solved)
      this.endsAt = Math.min(this.endsAt, now);
  }
  checkpoint() {
    return {
      nextAllowedAt: this.nextAllowedAt,
      solved: this.solved,
      stage: this.stage,
      opened: this.opened,
      skipped: this.skipped,
      endsAt: this.endsAt,
      results: [...this.results],
    };
  }
  restore(state: ReturnType<PlayerRound['checkpoint']>) {
    this.nextAllowedAt = state.nextAllowedAt;
    this.solved = state.solved;
    this.stage = state.stage;
    this.opened = state.opened;
    this.skipped = state.skipped;
    this.endsAt = state.endsAt;
    this.results = new Map(state.results);
  }
  get deadline() {
    return this.endsAt;
  }
  get selectedStage() {
    return this.stage;
  }
  get openedStage() {
    return this.opened;
  }
  get possibleScore() {
    return 20 - this.opened * 4;
  }
  select(stage: number, now: number) {
    if (
      !Number.isInteger(stage) ||
      stage < 0 ||
      stage > 4 ||
      stage > this.opened + 1
    )
      throw new Error('Открывайте подсказки по порядку.');
    if (now < this.startedAt || now >= this.endsAt || this.solved)
      throw new Error('Раунд для вас уже завершён.');
    if (stage > this.opened) {
      this.opened = stage;
      this.endsAt -= 5000;
    }
    this.stage = stage;
  }
  constructor(
    private readonly answerId: string,
    private readonly startedAt: number,
    private endsAt: number,
  ) {
    if (endsAt <= startedAt) throw new Error('Invalid round duration');
  }
  answer(attempt: Attempt): Result {
    const previous = this.results.get(attempt.commandId);
    if (previous) return previous;
    let status: Result['status'];
    let score = 0;
    if (
      attempt.receivedAt < this.startedAt ||
      attempt.receivedAt >= this.endsAt
    )
      status = 'finished';
    else if (this.solved) status = 'already-correct';
    else if (attempt.receivedAt < this.nextAllowedAt) status = 'cooldown';
    else if (attempt.titleId === this.answerId) {
      status = 'correct';
      this.solved = true;
      score = this.possibleScore;
    } else {
      status = 'incorrect';
      this.nextAllowedAt = attempt.receivedAt + ANSWER_COOLDOWN_MS;
    }
    const result = { status, score, nextAllowedAt: this.nextAllowedAt };
    this.results.set(attempt.commandId, result);
    return result;
  }
}
