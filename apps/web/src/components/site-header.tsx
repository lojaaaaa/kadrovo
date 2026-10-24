'use client';
import { Skeleton } from './ui/skeleton';
import { Avatar } from './avatar';
import { Aperture } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, type AccountState } from '@/lib/account';
import { SoundControls } from './sound-controls';
import { m } from './motion-system';
export function SiteHeader() {
  const path = usePathname();
  const inRoom = path.startsWith('/room/');
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  return (
    <header className="site-shell">
      <div className="site-shell-bar">
        <Link href="/" aria-label="Кадрово — главная" className="site-wordmark">
          <Aperture size={26} aria-hidden="true" />
          <span>
            кадрово<span className="site-brand-dot">.</span>
          </span>
        </Link>
        <nav
          aria-label="Основная навигация"
          className={`site-navigation ${inRoom ? 'site-navigation--playing' : ''}`}
        >
          {[
            { href: '/', label: 'Главная' },
            { href: '/play/solo', label: 'Соло' },
            { href: '/online', label: 'Онлайн' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? 'page' : undefined}
              className="site-navigation-link"
            >
              {path === item.href && (
                <m.span
                  className="site-navigation-active"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  aria-hidden="true"
                />
              )}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="site-shell-actions">
          <SoundControls />
          {account.isPending ? (
            <Skeleton className="h-9 w-24" aria-label="Загрузка профиля" />
          ) : (
            <Link
              href={account.data?.account ? '/profile' : '/account'}
              aria-label={
                account.data?.account
                  ? `Профиль ${account.data.account.nickname}`
                  : 'Войти'
              }
              className="site-profile-link"
            >
              {account.data?.account && (
                <Avatar
                  src={account.data.account.avatarUrl}
                  name={account.data.account.nickname}
                  className="size-7 text-xs"
                />
              )}
              <span
                className={
                  inRoom && account.data?.account ? 'hidden sm:inline' : ''
                }
              >
                {account.data?.account?.nickname ?? 'Войти'}
              </span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
