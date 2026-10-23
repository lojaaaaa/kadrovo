'use client';
import Link from 'next/link';
import { Clapperboard, Users, Settings2, ArrowUpRight } from 'lucide-react';
import { DailyFilm } from './daily-film';
export function HomeDashboard() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-10">
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Во что сыграем?</h1>
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            href: '/play/solo',
            title: 'Соло',
            text: 'Вы и кино. Играйте в своём темпе.',
            icon: Clapperboard,
          },
          {
            href: '/online',
            title: 'Онлайн',
            text: 'Дуэль или компания. Сразу в игру.',
            icon: Users,
          },
          {
            href: '/lobbies',
            title: 'Своя комната',
            text: 'Создайте лобби или присоединитесь к другим.',
            icon: Settings2,
          },
        ].map(({ href, title, text, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-60 flex-col rounded-3xl border bg-card p-6 transition hover:border-primary/60"
          >
            <Icon className="size-8 text-primary" />
            <h2 className="mt-auto flex items-center justify-between pt-8 text-2xl font-bold">
              {title}
              <ArrowUpRight className="size-5" />
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{text}</p>
          </Link>
        ))}
        <DailyFilm />
      </div>
    </main>
  );
}
