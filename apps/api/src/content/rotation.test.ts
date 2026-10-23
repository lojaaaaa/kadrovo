import { expect, it } from 'vitest';
import { CatalogRotation } from './rotation';
const items = Array.from({ length: 30 }, (_, i) => ({
  title: { id: String(i) },
}));
it('uses the whole pool before repeating and balances repeated cycles', () => {
  const r = new CatalogRotation();
  const cycle = Array.from({ length: 10 }, () => r.pick(items, 3))
    .flat()
    .map((i) => i.title.id);
  expect(new Set(cycle).size).toBe(30);
  expect(new Set(r.pick(items, 3).map((i) => i.title.id)).size).toBe(3);
});
it('preserves recency across restarts and gives priority to new content', () => {
  const r = new CatalogRotation();
  const used = r.pick(items, 20);
  const next = new CatalogRotation();
  next.restore(r.snapshot());
  expect(
    next
      .pick(items, 10)
      .every((i) => !used.some((u) => u.title.id === i.title.id)),
  ).toBe(true);
  expect(next.pick([...items, { title: { id: 'new' } }], 1)[0]!.title.id).toBe(
    'new',
  );
});
it('shares history across overlapping collections and safely supports long matches', () => {
  const r = new CatalogRotation();
  const a = r.pick(items, 3);
  const others = items.filter((i) => !a.includes(i));
  expect(r.pick([...a, ...others.slice(0, 3)], 3)).toEqual(
    expect.arrayContaining(others.slice(0, 3)),
  );
  expect(r.pick(items.slice(0, 3), 7)).toHaveLength(7);
  expect(() => r.restore({ sequence: 1, seen: [['x', 2]] })).toThrow();
});
