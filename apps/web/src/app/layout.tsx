import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
export const metadata: Metadata = {
  title: 'Кадрово — вспомните это кино',
  description: 'Угадывайте фильмы, сериалы и мультфильмы по кадрам и постерам.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
