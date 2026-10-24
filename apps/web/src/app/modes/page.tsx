import Link from 'next/link';
import {
  Film,
  ScanSearch,
  Grid2X2,
  Shuffle,
  AudioLines,
  Shapes,
  UserRound,
} from 'lucide-react';
const modes = [
  {
    id: 'frames',
    name: 'Кадры',
    icon: Film,
    text: 'Пять разных сцен. Узнайте фильм с минимальным числом подсказок.',
  },
  {
    id: 'spotlight',
    name: 'Лупа',
    icon: ScanSearch,
    text: 'Небольшой фрагмент постера расширяется с каждой подсказкой.',
  },
  {
    id: 'pixels',
    name: 'Пиксели',
    icon: Grid2X2,
    text: 'Один кадр постепенно становится чётче. Сначала — только цвета и силуэты.',
  },
  {
    id: 'mix',
    name: 'Микс',
    icon: Shuffle,
    text: 'Чередование кадров и лупы в одной партии.',
  },
];
export default function ModesPage() {
  return (
    <main className="screen screen--modes mx-auto max-w-6xl px-5 py-10">
      <p className="text-xs uppercase tracking-[.25em] text-primary">
        Способы вспомнить кино
      </p>
      <h1 className="cinema-title mt-3 text-3xl md:text-4xl">
        Знакомое кино.
        <br />
        Новая загадка.
      </h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {modes.map((m) => (
          <Link
            key={m.id}
            href={`/play/solo?mode=${m.id}`}
            className="mode-choice cinema-panel rounded-2xl border p-5 transition hover:border-primary/40"
          >
            <m.icon className="size-7 text-primary" />
            <h2 className="mt-6 text-2xl font-semibold">{m.name}</h2>
            <p className="mt-3 text-muted-foreground">{m.text}</p>
            <span className="mt-6 block text-sm text-primary">
              Попробовать →
            </span>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <p className="text-xs uppercase tracking-widest text-primary">
          Следующие идеи · пока не доступны
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              name: 'Реплики',
              icon: AudioLines,
              text: 'Узнать фильм по короткой цитате. Каждая подсказка добавляет слова.',
            },
            {
              name: 'Три детали',
              icon: Shapes,
              text: 'Предмет, место и персонаж. Три ассоциации ведут к одному фильму.',
            },
            {
              name: 'Силуэты',
              icon: UserRound,
              text: 'Начинаем с контуров персонажей, затем постепенно возвращаем детали кадра.',
            },
          ].map((m) => (
            <article
              key={m.name}
              className="rounded-2xl border border-dashed p-6"
            >
              <m.icon className="size-5 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold">{m.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {m.text}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
