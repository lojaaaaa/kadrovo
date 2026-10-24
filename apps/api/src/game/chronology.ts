import { randomBytes, randomInt } from 'node:crypto';
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChronologySnapshot, TitleOption } from '@filmless/contracts';
type Film = TitleOption & { year: number };
type Session = {
  startCommandId?: string;
  owner: string;
  expires: number;
  films: Film[];
  index: number;
  score: number;
  pairId: string;
  result?: ChronologySnapshot['result'];
  commandId?: string;
};
const opaque = () => randomBytes(24).toString('hex');
/** Casual game only. The client never supplies years, score or a correct-answer flag. */
export class ChronologyGame {
  private sessions = new Map<string, Session>();
  started(owner: string, commandId?: string) {
    this.prune();
    if (!commandId) return undefined;
    for (const [id, session] of this.sessions)
      if (session.owner === owner && session.startCommandId === commandId)
        return this.snapshot(id, owner);
    return undefined;
  }
  start(owner: string, titles: TitleOption[], commandId?: string) {
    this.prune();
    const pool = [
      ...new Map(
        titles
          .filter(
            (t): t is Film =>
              Number.isInteger(t.year) &&
              t.year! >= 1880 &&
              t.year! <= new Date().getUTCFullYear() &&
              !!t.posterUrl,
          )
          .map((t) => [t.id, t]),
      ).values(),
    ];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const films: Film[] = [];
    for (const t of pool)
      if (films.at(-1)?.year !== t.year) {
        films.push(t);
        if (films.length === 11) break;
      }
    if (films.length < 4)
      throw new ServiceUnavailableException(
        'Для этого режима пока недостаточно фильмов с постерами и годами.',
      );
    for (const [id, s] of this.sessions)
      if (s.owner === owner) this.sessions.delete(id);
    if (this.sessions.size >= 5000)
      throw new ServiceUnavailableException(
        'Много активных игр. Попробуйте чуть позже.',
      );
    const id = opaque();
    this.sessions.set(id, {
      owner,
      startCommandId: commandId,
      expires: Date.now() + 30 * 60000,
      films,
      index: 0,
      score: 0,
      pairId: opaque(),
    });
    return this.snapshot(id, owner);
  }
  private prune() {
    for (const [id, s] of this.sessions)
      if (s.expires < Date.now()) this.sessions.delete(id);
  }
  private session(id: string, owner: string) {
    this.prune();
    const s = this.sessions.get(id);
    if (!s || s.owner !== owner)
      throw new NotFoundException(
        'Игра завершилась или недоступна. Начните новую.',
      );
    return s;
  }
  snapshot(id: string, owner: string): ChronologySnapshot {
    const s = this.session(id, owner),
      a = s.films[s.index]!,
      b = s.films[s.index + 1]!;
    const phase = s.result
      ? s.index === s.films.length - 2
        ? 'finished'
        : 'reveal'
      : 'answer';
    return {
      sessionId: id,
      pairId: s.pairId,
      round: s.index + 1,
      total: s.films.length - 1,
      score: s.score,
      phase,
      anchor: { name: a.name, year: a.year, posterUrl: a.posterUrl },
      challenger: {
        name: b.name,
        posterUrl: b.posterUrl,
        ...(s.result ? { year: b.year } : {}),
      },
      ...(s.result ? { result: s.result } : {}),
    };
  }
  answer(
    id: string,
    owner: string,
    pairId: string,
    commandId: string,
    choice: 'earlier' | 'later',
  ) {
    const s = this.session(id, owner);
    if (pairId !== s.pairId)
      throw new ConflictException('Эта пара уже завершена.');
    if (s.result) {
      if (s.commandId === commandId) return this.snapshot(id, owner);
      throw new ConflictException('Ответ уже принят.');
    }
    const answer =
      s.films[s.index + 1]!.year < s.films[s.index]!.year ? 'earlier' : 'later';
    s.result = { answer, choice, correct: answer === choice };
    s.commandId = commandId;
    if (s.result.correct) s.score++;
    s.expires = Date.now() + 30 * 60000;
    return this.snapshot(id, owner);
  }
  next(id: string, owner: string, pairId: string) {
    const s = this.session(id, owner);
    if (s.pairId !== pairId) return this.snapshot(id, owner);
    if (!s.result) throw new ConflictException('Сначала выберите ответ.');
    if (s.index === s.films.length - 2) return this.snapshot(id, owner);
    s.index++;
    s.result = undefined;
    s.commandId = undefined;
    s.pairId = opaque();
    return this.snapshot(id, owner);
  }
}
