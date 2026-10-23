import { pixelStages } from '../content/pixels';
import { searchEntry, searchTitles } from './search';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import sharp from 'sharp';
import type { CreateRoom, TitleOption } from '@filmless/contracts';
export type Question = {
  title: TitleOption;
  demo?: boolean;
  pixels?: string[];
  frames: string[];
  spotlight: string[];
};
const rows: [string, number, CreateRoom['category']][] = [
  ['Титаник', 1997, 'movies'],
  ['Интерстеллар', 2014, 'movies'],
  ['Матрица', 1999, 'movies'],
  ['Начало', 2010, 'movies'],
  ['Назад в будущее', 1985, 'movies'],
  ['Аватар', 2009, 'movies'],
  ['Один дома', 1990, 'movies'],
  ['Парк юрского периода', 1993, 'movies'],
  ['Инопланетянин', 1982, 'movies'],
  ['Челюсти', 1975, 'movies'],
  ['Дюна', 2021, 'movies'],
  ['Гарри Поттер и философский камень', 2001, 'movies'],
  ['Во все тяжкие', 2008, 'series'],
  ['Шерлок', 2010, 'series'],
  ['Очень странные дела', 2016, 'series'],
  ['Друзья', 1994, 'series'],
  ['Игра престолов', 2011, 'series'],
  ['Доктор Хаус', 2004, 'series'],
  ['Офис', 2005, 'series'],
  ['Теория большого взрыва', 2007, 'series'],
  ['Тьма', 2017, 'series'],
  ['Сверхъестественное', 2005, 'series'],
  ['Мандалорец', 2019, 'series'],
  ['Чернобыль', 2019, 'series'],
  ['В поисках Немо', 2003, 'animation'],
  ['Король Лев', 1994, 'animation'],
  ['Холодное сердце', 2013, 'animation'],
  ['Шрек', 2001, 'animation'],
  ['ВАЛЛ·И', 2008, 'animation'],
  ['Рататуй', 2007, 'animation'],
  ['История игрушек', 1995, 'animation'],
  ['Унесённые призраками', 2001, 'animation'],
  ['Смешарики', 2004, 'animation'],
  ['Гравити Фолз', 2012, 'animation'],
  ['Тайна Коко', 2017, 'animation'],
  ['Зверополис', 2016, 'animation'],
];
export const titles: TitleOption[] = rows.map(([name, year, category], i) => ({
  id: `demo-${i + 1}`,
  name,
  year,
  category,
}));
const searchEntries = titles.map((title) => searchEntry(title));
// Original geometric illustrations for a clearly labelled technical demo; no movie stills or posters.
const scenes: Record<string, string[]> = {
  'demo-1': [
    '<path d="M50 400 Q150 360 250 400 T550 400" stroke="#53bfe3" fill="none"/>',
    '<path d="M100 310H500L440 390H160Z" fill="#e5e0d5"/>',
    '<path d="M190 310V260H420V310" fill="#8f9ca8"/>',
    '<path d="M220 260V210H250V260 M290 260V210H320V260 M360 260V210H390V260" fill="#d57a39"/>',
    '<path d="M460 410L520 280L580 410Z" fill="#bbecff"/><circle cx="160" cy="180" r="36" fill="#fff2c0"/>',
  ],
  'demo-2': [
    '<circle cx="300" cy="300" r="85" fill="#0c1018" stroke="#f3ce91" stroke-width="15"/>',
    '<ellipse cx="300" cy="300" rx="210" ry="40" fill="none" stroke="#e3a44d" stroke-width="14"/>',
    '<path d="M70 450L120 410L160 450L120 440Z" fill="#ededed"/>',
    '<circle cx="455" cy="140" r="42" fill="#869aad"/><circle cx="140" cy="110" r="5" fill="white"/>',
    '<circle cx="480" cy="470" r="45" fill="none" stroke="#ddd"/><path d="M480 435V470L500 490" stroke="#ddd"/>',
  ],
  'demo-3': [
    '<path d="M130 90V500 M230 50V470 M330 110V530 M430 70V480" stroke="#2c9a56" stroke-dasharray="12 18" stroke-width="12"/>',
    '<path d="M70 140V450 M180 140V540 M380 90V480 M520 70V540" stroke="#93e5a8" stroke-dasharray="8 22"/>',
    '<rect x="200" y="270" width="85" height="48" rx="20" fill="#111" stroke="#a7d7b4"/><rect x="315" y="270" width="85" height="48" rx="20" fill="#111" stroke="#a7d7b4"/>',
    '<path d="M285 290H315" stroke="white"/>',
    '<rect x="160" y="410" width="90" height="30" rx="15" fill="#dc5558"/><rect x="350" y="410" width="90" height="30" rx="15" fill="#4697ef"/>',
  ],
  'demo-13': [
    '<path d="M270 160V270L200 400Q190 430 220 430H380Q410 430 400 400L330 270V160" fill="none" stroke="#ddd" stroke-width="8"/>',
    '<path d="M230 350H370L390 415H210Z" fill="#60c4e4"/>',
    '<circle cx="280" cy="370" r="10" fill="#d9f4ff"/><circle cx="320" cy="395" r="8" fill="#d9f4ff"/>',
    '<path d="M100 180H210L190 130H120Z M120 180V210H190V180" fill="#17191c" stroke="#e1ba63"/>',
    '<rect x="390" y="240" width="140" height="90" rx="8" fill="#e0c77f"/><circle cx="415" cy="340" r="20"/><circle cx="505" cy="340" r="20"/>',
  ],
  'demo-14': [
    '<circle cx="280" cy="260" r="90" fill="#182d34" stroke="#d8bc7d" stroke-width="16"/>',
    '<path d="M345 330L440 440" stroke="#d8bc7d" stroke-width="28"/>',
    '<path d="M120 430H260V500H120Z M135 430V390H245V430" fill="#a24839"/>',
    '<path d="M450 220V110L470 85L490 110V220" fill="#9b998b"/><circle cx="470" cy="150" r="15" fill="#f3d991"/>',
    '<path d="M130 180H210L195 155H145Z M150 180Q140 220 180 220H220" fill="none" stroke="#ae815a" stroke-width="12"/>',
  ],
  'demo-15': [
    '<rect x="230" y="140" width="140" height="280" fill="#421b29" stroke="#e34d55" stroke-width="10"/>',
    '<path d="M250 380L350 180 M250 180L350 380" stroke="#b52a4e"/>',
    '<circle cx="140" cy="450" r="45" fill="none" stroke="#93bac9"/><circle cx="280" cy="450" r="45" fill="none" stroke="#93bac9"/>',
    '<path d="M140 450L200 380L280 450H140L180 390 M200 380H240" fill="none" stroke="#93bac9"/>',
    '<path d="M70 95Q300 160 530 95" fill="none" stroke="#ddd"/><circle cx="150" cy="113" r="10" fill="#ebbb60"/><circle cx="300" cy="128" r="10" fill="#e66a67"/><circle cx="450" cy="113" r="10" fill="#6cae89"/>',
  ],
  'demo-25': [
    '<path d="M60 470Q80 400 60 350 M100 500Q120 420 100 370" stroke="#5ca39a" fill="none"/>',
    '<ellipse cx="300" cy="300" rx="105" ry="65" fill="#e88b36"/>',
    '<path d="M390 300L475 240V360Z" fill="#e88b36"/><circle cx="240" cy="280" r="10" fill="#101014"/>',
    '<path d="M275 240V360 M335 240V360" stroke="#fff2df" stroke-width="20"/>',
    '<circle cx="160" cy="210" r="14" fill="none" stroke="#98dce1"/><circle cx="130" cy="150" r="8" fill="none" stroke="#98dce1"/>',
  ],
  'demo-26': [
    '<circle cx="300" cy="180" r="95" fill="#d4a94e"/>',
    '<path d="M120 500L290 310L450 500Z" fill="#3d3044"/>',
    '<circle cx="300" cy="290" r="65" fill="#9e6336"/>',
    '<circle cx="300" cy="285" r="38" fill="#eac475"/><circle cx="288" cy="280" r="4"/><circle cx="312" cy="280" r="4"/>',
    '<path d="M250 385L270 320H325L350 385 M250 385V420 M340 385V420" fill="none" stroke="#eac475" stroke-width="16"/>',
  ],
  'demo-27': [
    '<path d="M300 130V470 M155 215L445 385 M155 385L445 215" stroke="#a4e5ff" stroke-width="12"/>',
    '<path d="M265 160L300 200L335 160 M265 440L300 400L335 440" fill="none" stroke="#a4e5ff" stroke-width="8"/>',
    '<path d="M180 220L220 250L180 275 M420 325L380 350L420 380" fill="none" stroke="#a4e5ff" stroke-width="8"/>',
    '<path d="M80 500V410L115 360L150 410V500 M450 500V410L485 360L520 410V500" fill="#7cb2d3"/>',
    '<circle cx="300" cy="490" r="26" fill="#f4f9ff"/><circle cx="300" cy="450" r="18" fill="#f4f9ff"/><path d="M300 450L326 454L300 458" fill="#e79d44"/>',
  ],
};
@Injectable()
export class DemoCatalog implements OnModuleInit {
  private questions: Question[] = [];
  async onModuleInit() {
    this.questions = await Promise.all(
      Object.entries(scenes).map(async ([id, layers]) => {
        const svg = (body: string) =>
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#14212a"/><g stroke-width="5">${body}</g></svg>`,
          );
        const uri = (b: Buffer) =>
          `data:image/png;base64,${b.toString('base64')}`;
        const full = await sharp(svg(layers.join('')))
          .png()
          .toBuffer();
        const frames = await Promise.all(
          layers.map(async (_, i) =>
            uri(
              await sharp(svg(layers.slice(0, i + 1).join('')))
                .png()
                .toBuffer(),
            ),
          ),
        );
        const spotlight = await Promise.all(
          [100, 170, 270, 410, 600].map(async (size) =>
            uri(
              await sharp(full)
                .extract({
                  left: Math.floor((600 - size) / 2),
                  top: Math.floor((600 - size) / 2),
                  width: size,
                  height: size,
                })
                .resize(600, 600)
                .png()
                .toBuffer(),
            ),
          ),
        );
        return {
          title: {
            ...titles.find((t) => t.id === id)!,
            posterUrl: spotlight[4],
          },
          frames,
          spotlight,
          pixels: await pixelStages(full),
        };
      }),
    );
  }
  deck(
    category: CreateRoom['category'],
    _mode?: CreateRoom['mode'],
    _source?: 'demo' | 'catalog',
    _collection?: string,
    count = 3,
  ): Question[] {
    const deck = this.questions.filter((q) => q.title.category === category);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    if (!deck.length) throw new Error('Демоподборка ещё загружается.');
    const total = typeof count === 'number' && count > 0 ? count : 3;
    const result: Question[] = [];
    for (let i = 0; i < total; i++) {
      result.push(deck[i % deck.length]!);
    }
    return result;
  }
  search(category: CreateRoom['category'], query: string) {
    return searchTitles(searchEntries, category, query);
  }
  has(id: string, category: CreateRoom['category']) {
    return titles.some((t) => t.id === id && t.category === category);
  }
}
