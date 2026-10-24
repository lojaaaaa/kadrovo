/** Bounded byte cache; concurrent reads of the same raster share one operation. */
export class MediaCache {
  private values = new Map<string, Buffer>();
  private pending = new Map<string, Promise<Buffer>>();
  private bytes = 0;
  constructor(private readonly limit = 32 * 1024 * 1024) {}
  retain(keys: Set<string>) {
    for (const [key, value] of this.values)
      if (!keys.has(key)) {
        this.values.delete(key);
        this.bytes -= value.length;
      }
  }
  async get(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.values.get(key);
    if (hit) {
      this.values.delete(key);
      this.values.set(key, hit);
      return hit;
    }
    const active = this.pending.get(key);
    if (active) return active;
    const task = load()
      .then((value) => {
        if (value.length <= this.limit) {
          while (this.bytes + value.length > this.limit && this.values.size) {
            const oldest = this.values.entries().next().value!;
            this.values.delete(oldest[0]);
            this.bytes -= oldest[1].length;
          }
          this.values.set(key, value);
          this.bytes += value.length;
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
}
