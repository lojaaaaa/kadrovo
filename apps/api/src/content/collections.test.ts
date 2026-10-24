import { describe, expect, it } from 'vitest';
import { createRoomSchema } from '@filmless/contracts';
import { ContentCatalog } from './catalog';
import { CatalogStore } from './store';
import { DemoCatalog, type Question } from '../game/catalog';
function fixture() {
  const catalog = new ContentCatalog(new DemoCatalog(), {} as CatalogStore);
  const questions: Question[] = [
    1989, 1990, 1995, 1999, 2000, 2005, 2009, 2010,
  ].map((year, i) => ({
    title: { id: String(i), name: `Film ${i}`, year, category: 'movies' },
    frames: Array(5).fill('frame'),
    spotlight: i === 2 ? [] : Array(5).fill('crop'),
  }));
  questions.push({
    title: {
      id: 'animation',
      name: 'Animation',
      year: 1995,
      category: 'animation',
    },
    frames: Array(5).fill('frame'),
    spotlight: [],
  });
  Object.assign(catalog, { questions, ready: true });
  return catalog;
}
describe('catalog collections', () => {
  it('selects three distinct films only within the chosen decade', () => {
    const deck = fixture().deck('movies', 'frames', 'catalog', 'nineties');
    expect(deck.map((q) => q.title.year).sort()).toEqual([1990, 1995, 1999]);
    expect(new Set(deck.map((q) => q.title.id)).size).toBe(3);
  });
  it('counts only playable questions in the selected category and mechanic', () => {
    const data = fixture().availability();
    expect(
      data.collections
        ?.find((c) => c.id === 'nineties')
        ?.categories.find((c) => c.category === 'movies'),
    ).toEqual({
      category: 'movies',
      pixels: 0,
      frames: 3,
      spotlight: 2,
      mix: 2,
    });
    expect(() =>
      fixture().deck('movies', 'mix', 'catalog', 'nineties'),
    ).toThrow();
    expect(fixture().deck('movies', 'frames', 'catalog', 'all')).toHaveLength(
      3,
    );
  });
  it('rejects invented collection IDs at the request boundary', () => {
    expect(
      createRoomSchema.safeParse({
        nickname: 'Игрок',
        category: 'movies',
        mode: 'frames',
        collection: 'anything',
      }).success,
    ).toBe(false);
  });
});
it('keeps future releases out of playable pools', () => {
  const catalog = new ContentCatalog(new DemoCatalog(), {} as CatalogStore);
  const year = new Date().getUTCFullYear();
  Object.assign(catalog, {
    questions: Array.from({ length: 6 }, (_, i) => ({
      title: {
        id: String(i),
        name: 'Film',
        year: i < 3 ? year : year + 2,
        category: 'movies',
      },
      frames: Array(5).fill('frame'),
      spotlight: Array(5).fill('poster'),
    })),
    ready: true,
  });
  expect(
    catalog.availability().categories.find((c) => c.category === 'movies')
      ?.frames,
  ).toBe(3);
  expect(
    catalog
      .deck('movies', 'frames', 'catalog')
      .every((q) => q.title.year! <= year),
  ).toBe(true);
});

it('excludes animation episode compilations without excluding real film sequels', () => {
  const catalog = new ContentCatalog(new DemoCatalog(), {} as CatalogStore);
  Object.assign(catalog, {
    questions: [
      'Маша и Медведь. Зимние серии',
      'Шрэк',
      'Шрэк 2',
      'Тайна Коко',
    ].map((name, i) => ({
      title: { id: String(i), name, year: 2020, category: 'animation' },
      frames: Array(5).fill('frame'),
      spotlight: Array(5).fill('poster'),
    })),
    ready: true,
  });
  expect(
    catalog.availability().categories.find((c) => c.category === 'animation')
      ?.frames,
  ).toBe(3);
  expect(
    catalog.deck('animation', 'frames', 'catalog').map((q) => q.title.name),
  ).not.toContain('Маша и Медведь. Зимние серии');
});
it('shortens a small collection instead of repeating films inside a match', () => {
  const deck = fixture().deck('movies', 'frames', 'catalog', 'nineties', 10);
  expect(deck).toHaveLength(3);
  expect(new Set(deck.map((q) => q.title.id)).size).toBe(3);
});
