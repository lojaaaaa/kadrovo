'use client';
import { Avatar } from './avatar';
import { Aperture } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, type AccountState } from '@/lib/account';
import { SoundControls } from './sound-controls';
export function SiteHeader() {
  const path = usePathname();
  const inRoom = path.startsWith('/room/');
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  return (
    <header className="border-b border-white/5 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-5 md:px-8">
        <Link
          href="/"
          aria-label="Кадрово — главная"
          className="mr-auto flex items-center gap-2 text-xl font-bold tracking-tight"
        >
          <Aperture className="size-7 text-primary" />
          <span>
            кадрово<span className="text-primary">.</span>
          </span>
        </Link>
        <nav
          aria-label="Основная навигация"
          className={`${inRoom ? 'hidden xl:flex' : 'flex'} order-3 w-full gap-1 overflow-x-auto xl:order-none xl:w-auto`}
        >
          {[
            { href: '/', label: 'Главная' },
            { href: '/play/party', label: 'С друзьями' },
            { href: '/play/solo', label: 'Соло' },
            { href: '/battle', label: 'Батл' },
            { href: '/collections', label: 'Подборки' },
            { href: '/ratings', label: 'Рейтинг' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${path === item.href ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-3">
          <SoundControls />
          <Link
            href={account.data?.account ? '/profile' : '/account'}
            className="flex max-w-40 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:border-primary"
          >
            {account.data?.account && (
              <Avatar
                src={account.data.account.avatarUrl}
                name={account.data.account.nickname}
                className="size-7 text-xs"
              />
            )}
            <span
              className={`${inRoom ? 'hidden sm:inline' : 'inline'} max-w-24 truncate`}
            >
              {account.data?.account?.nickname ?? 'Войти'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
