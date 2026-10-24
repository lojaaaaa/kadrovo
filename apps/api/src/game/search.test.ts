import { describe, expect, it } from 'vitest';
import { searchEntry, searchTitles } from './search';
const entry = (
  id: string,
  name: string,
  aliases: string[] = [],
  category: 'movies' | 'series' = 'movies',
) => searchEntry({ id, name, year: 2000, category }, aliases);
const entries = [
  entry('1', 'Интерстеллар', ['Interstellar']),
  entry('2', 'Матрица'),
  entry('3', 'Унесённые призраками'),
  entry('4', 'Гарри Поттер и философский камень'),
  entry('5', 'Матрица', [], 'series'),
];
const ids = (query: string) =>
  searchTitles(entries, 'movies', query).map((t) => t.id);
describe('title search', () => {
  it('normalizes Russian names and searches aliases and parts of names', () => {
    expect(ids('УНЕСЕННЫЕ')).toEqual(['3']);
    expect(ids('interstellar')).toEqual(['1']);
    expect(ids('гарри-поттер')).toEqual(['4']);
    expect(ids('призрак')).toEqual(['3']);
  });
  it('handles missing, extra, replaced and transposed letters', () => {
    for (const query of ['матриа', 'матррица', 'матреца', 'мартрица'])
      expect(ids(query)).toContain('2');
    expect(ids('интерстелар')).toEqual(['1']);
    expect(ids('потер')).toEqual(['4']);
  });
  it('does not fuzz short input or cross category boundaries', () => {
    expect(ids('мт')).toEqual([]);
    expect(ids('!')).toEqual([]);
    expect(ids('матрица')).toEqual(['2']);
    expect(searchTitles(entries, 'series', 'матрица').map((t) => t.id)).toEqual(
      ['5'],
    );
  });
  it('ranks direct matches and does not fill a good result set with fuzzy noise', () => {
    const options = [
      entry('fuzzy', 'Матрицы'),
      entry('substring', 'Старая Матрица'),
      entry('prefix', 'Матрица: Перезагрузка'),
      entry('exact', 'Матрица'),
    ];
    expect(searchTitles(options, 'movies', 'матрица').map((t) => t.id)).toEqual(
      ['exact', 'prefix', 'substring'],
    );
  });
  it('deduplicates aliases and limits results to eight with stable ordering', () => {
    const options = Array.from({ length: 12 }, (_, i) =>
      entry(String(i), `Кино ${i}`, ['Кино', 'КИНО']),
    );
    const found = searchTitles(options, 'movies', 'кино');
    expect(found).toHaveLength(8);
    expect(new Set(found.map((t) => t.id)).size).toBe(8);
    expect(searchTitles([...options].reverse(), 'movies', 'кино')).toEqual(
      found,
    );
  });
});
