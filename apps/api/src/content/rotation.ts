import { randomInt } from 'node:crypto';
import { z } from 'zod';
const stateSchema = z.object({
  sequence: z.number().int().nonnegative(),
  seen: z
    .array(z.tuple([z.string().max(100), z.number().int().nonnegative()]))
    .max(5000),
});
export class CatalogRotation {
  private sequence = 0;
  private seen = new Map<string, number>();
  restore(raw: unknown) {
    const state = stateSchema.parse(raw);
    if (state.seen.some(([, n]) => n > state.sequence))
      throw new Error('Invalid rotation sequence');
    this.sequence = state.sequence;
    this.seen = new Map(state.seen);
  }
  snapshot() {
    return { sequence: this.sequence, seen: [...this.seen] };
  }
  pick<T extends { title: { id: string } }>(items: T[], count: number): T[] {
    if (!items.length || !Number.isInteger(count) || count < 1 || count > 1000)
      throw new Error('Invalid deck size');
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    // Randomize only films with equal recency. Unseen titles always come first.
    shuffled.sort(
      (a, b) =>
        (this.seen.get(a.title.id) ?? -1) - (this.seen.get(b.title.id) ?? -1),
    );
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      const item = shuffled[i % shuffled.length]!;
      result.push(item);
      this.seen.set(item.title.id, ++this.sequence);
    }
    if (this.seen.size > 5000)
      this.seen = new Map(
        [...this.seen].sort((a, b) => b[1] - a[1]).slice(0, 5000),
      );
    return result;
  }
}
