import type { RoundReview } from '@filmless/contracts';
export type Connection = {
  names: string[];
  prompt: string;
  options: string[];
  correct: string;
};
/** Uses revealed facts only; this optional quiz never affects a match or rating. */
export function connectionQuiz(history: RoundReview[]): Connection | null {
  if (history.length < 3) return null;
  let group: RoundReview[] = [];
  let correct = '';
  let prompt = '';
  let pool: string[] = [];
  for (const r of history) {
    for (const genre of r.title.genres ?? []) {
      const shared = history.filter((v) => v.title.genres?.includes(genre));
      if (shared.length >= 3) {
        group = shared.slice(0, 3);
        correct = genre;
        prompt = 'Какой жанр объединяет эти фильмы?';
        pool = [
          'комедия',
          'драма',
          'фантастика',
          'боевик',
          'мелодрама',
          'приключения',
          'ужасы',
        ].filter((g) => !group.every((v) => v.title.genres?.includes(g)));
        break;
      }
    }
    if (group.length) break;
  }
  if (!group.length) {
    for (const r of history) {
      if (r.title.year === null) continue;
      const decade = Math.floor(r.title.year / 10) * 10;
      const shared = history.filter(
        (v) =>
          v.title.year !== null &&
          Math.floor(v.title.year / 10) * 10 === decade,
      );
      if (shared.length >= 3) {
        group = shared.slice(0, 3);
        correct = decade + '-е';
        prompt = 'В каком десятилетии вышли все три фильма?';
        pool = [decade - 20, decade - 10, decade + 10, decade + 20]
          .filter(
            (y) =>
              y >= 1890 &&
              y <= Math.floor(new Date().getUTCFullYear() / 10) * 10,
          )
          .map((y) => y + '-е');
        if (pool.length < 3)
          pool.push(...[1950, 1960, 1970, 1980, 1990].map((y) => y + '-е'));
        break;
      }
    }
  }
  if (group.length < 3) return null;
  const distractors = [...new Set(pool)]
    .filter((p) => p !== correct)
    .slice(0, 3);
  if (distractors.length < 3) return null;
  const options = [correct, ...distractors];
  const shift =
    group
      .map((r) => r.title.id)
      .join('')
      .split('')
      .reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  return {
    names: group.map((r) => r.title.name),
    prompt,
    correct,
    options: [...options.slice(shift), ...options.slice(0, shift)],
  };
}
