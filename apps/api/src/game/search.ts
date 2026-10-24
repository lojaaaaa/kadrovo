import type { TitleOption } from '@filmless/contracts';

export const normalizeTitle = (value: string) =>
  value
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]/g, '');

export type SearchEntry = {
  option: TitleOption;
  names: string[];
  words: string[];
};
export function searchEntry(
  option: TitleOption,
  aliases: string[] = [],
): SearchEntry {
  const raw = [option.name, ...aliases];
  return {
    option,
    names: [...new Set(raw.map(normalizeTitle).filter(Boolean))],
    words: [
      ...new Set(
        raw
          .flatMap((name) => name.split(/[^a-zа-яё0-9]+/i).map(normalizeTitle))
          .filter(Boolean),
      ),
    ],
  };
}

// Bounded optimal-string-alignment distance: adjacent transpositions count once.
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j++) {
      let value = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, beforePrevious[j - 2]! + 1);
      current.push(value);
      minimum = Math.min(minimum, value);
    }
    if (minimum > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length]!;
}

export function searchTitles(
  entries: SearchEntry[],
  category: TitleOption['category'],
  query: string,
): TitleOption[] {
  const q = normalizeTitle(query.slice(0, 80));
  if (q.length < 2) return [];
  const limit = q.length < 4 ? 0 : q.length < 8 ? 1 : 2;
  const ranked = entries
    .filter((entry) => entry.option.category === category)
    .map((entry) => {
      let rank = Infinity;
      for (const name of entry.names) {
        if (name === q) rank = Math.min(rank, 0);
        else if (name.startsWith(q)) rank = Math.min(rank, 1);
        else if (name.includes(q)) rank = Math.min(rank, 2);
        else if (limit && rank > 2) {
          const edits = distance(q, name, limit);
          if (edits <= limit) rank = Math.min(rank, 3 + edits);
        }
      }
      if (limit && rank > 2) {
        for (const word of entry.words) {
          const edits = distance(q, word, limit);
          if (edits <= limit) rank = Math.min(rank, 3 + edits);
        }
      }
      return { ...entry, rank };
    })
    .filter((entry) => Number.isFinite(entry.rank))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.option.name.localeCompare(b.option.name, 'ru') ||
        (b.option.year ?? 0) - (a.option.year ?? 0) ||
        a.option.id.localeCompare(b.option.id),
    );
  const exact = ranked.filter((entry) => entry.rank <= 2);
  // Fuzzy suggestions are useful for typos, not for filling a good prefix search with noise.
  return (exact.length >= 3 ? exact : ranked)
    .slice(0, 8)
    .map((entry) => entry.option);
}
