'use client';
import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/account';
import { SectionSkeleton } from './section-skeleton';
import { ResumeGame } from './resume-game';
import Link from 'next/link';
import { ArrowRight, Clapperboard, Users, Settings2 } from 'lucide-react';
import { DailyFilm } from './daily-film';

/** Decorative film windows, with no game content or spoilers. */
function FilmWindows({ online = false }: { online?: boolean }) {
  return (
    <svg
      className="home-film-art"
      viewBox="0 0 240 200"
      fill="none"
      aria-hidden="true"
    >
      <g className="home-film-back" transform="rotate(-14 120 100)">
        <rect x="65" y="30" width="146" height="110" rx="12" />
        <path d="M65 49h146M65 121h146M82 36v7m20-7v7m20-7v7m20-7v7m20-7v7m20-7v7m20-7v7" />
      </g>
      <g className="home-film-front" transform="rotate(8 120 100)">
        <rect x="25" y="65" width="160" height="112" rx="12" />
        <path d="M25 84h160M25 158h160M41 71v7m22-7v7m22-7v7m22-7v7m22-7v7m22-7v7m22-7v7" />
        {online ? (
          <>
            <circle cx="89" cy="111" r="10" />
            <circle cx="123" cy="111" r="10" />
            <path d="M72 144c0-21 34-21 34 0m0 0c0-21 34-21 34 0" />
          </>
        ) : (
          <path d="m94 101 27 20-27 20z" />
        )}
      </g>
    </svg>
  );
}

export function HomeDashboard() {
  const queries = useQueries({
    queries: [
      { queryKey: ['account'], queryFn: () => api('auth/me') },
      {
        queryKey: ['experience'],
        queryFn: () => api('experience'),
        staleTime: 5000,
      },
      {
        queryKey: ['content-availability'],
        queryFn: () => api('content/availability'),
      },
    ],
  });
  if (
    queries.some((q) => q.isPending || (q.isFetching && !q.isFetchedAfterMount))
  )
    return (
      <main className="home-screen">
        <SectionSkeleton kind="home" />
      </main>
    );
  if (queries.some((q) => q.error))
    return (
      <main className="home-screen">
        <p role="alert">Не удалось загрузить страницу.</p>
        <button onClick={() => queries.forEach((q) => void q.refetch())}>
          Повторить
        </button>
      </main>
    );
  return (
    <main className="home-screen">
      <ResumeGame />

      <header className="home-heading home-enter">
        <p className="home-eyebrow">Угадывайте кино</p>
        <h1>Выберите игру</h1>
      </header>
      <div className="home-primary">
        {[
          {
            href: '/play/solo',
            title: 'Соло',
            text: 'Вы и кино. Без соперников.',
            icon: Clapperboard,
            action: 'Играть одному',
            tone: 'solo',
            number: '01',
          },
          {
            href: '/online',
            title: 'Онлайн',
            text: 'Дуэль или компания до 8 игроков.',
            icon: Users,
            action: 'Найти игроков',
            tone: 'online',
            number: '02',
          },
        ].map(({ href, title, text, icon: Icon, action, tone, number }) => (
          <Link
            key={href}
            href={href}
            className={`home-mode home-mode--${tone} home-enter`}
          >
            <FilmWindows online={tone === 'online'} />
            <div className="home-mode-top">
              <Icon size={21} aria-hidden="true" />
              <span>{number}</span>
            </div>
            <div className="home-mode-copy">
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
            <span className="home-mode-action">
              {action}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      <div className="home-secondary home-enter">
        <Link href="/lobbies" className="home-room">
          <span className="home-row-icon">
            <Settings2 size={21} aria-hidden="true" />
          </span>
          <span className="home-row-copy">
            <h2>Своя комната</h2>
            <p>Друзья, приглашения и ваши правила.</p>
          </span>
          <span className="home-row-action">
            Открыть лобби
            <ArrowRight size={17} aria-hidden="true" />
          </span>
        </Link>
        <DailyFilm />
      </div>
    </main>
  );
}
