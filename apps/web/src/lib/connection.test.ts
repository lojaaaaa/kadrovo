import { it, expect } from 'vitest';
import { connectionQuiz } from './connection';
const history = Array.from({ length: 5 }, (_, i) => ({
  title: {
    id: String(i),
    name: 'Фильм ' + i,
    year: 1990 + i,
    category: 'movies' as const,
  },
  score: 0,
  solved: false,
  hints: 0,
}));
it('builds an unambiguous decade connection from revealed films', () => {
  const q = connectionQuiz(history)!;
  expect(q.correct).toBe('1990-е');
  expect(new Set(q.options).size).toBe(4);
  expect(q.names).toHaveLength(3);
});
it('does not invent a common fact when neither era nor genre matches', () => {
  expect(
    connectionQuiz(
      history
        .slice(0, 3)
        .map((r, i) => ({ ...r, title: { ...r.title, year: 1900 + i * 30 } })),
    ),
  ).toBeNull();
});
it('does not use another shared genre as an incorrect option', () => {
  const q = connectionQuiz(
    history.map((r) => ({
      ...r,
      title: { ...r.title, genres: ['драма', 'комедия'] },
    })),
  )!;
  expect(q.correct).toBe('драма');
  expect(q.options).not.toContain('комедия');
});
