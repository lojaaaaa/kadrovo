'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
export function BackNavigation() {
  const path = usePathname();
  if (path === '/' || path === '/play/chronology' || path.startsWith('/room/'))
    return null;
  const parent =
    path === '/play/party'
      ? '/lobbies'
      : ['/lobbies', '/ratings', '/battle'].includes(path)
        ? '/online'
        : '/';
  return (
    <nav className="back-navigation" aria-label="Возврат">
      <Link href={parent}>
        <ArrowLeft size={17} aria-hidden="true" />
        <span>Назад</span>
      </Link>
    </nav>
  );
}
