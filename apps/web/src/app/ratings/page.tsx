'use client';
import Link from 'next/link';
import { Trophy, Swords } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/account';
import { Avatar } from '@/components/avatar';
type Player = {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  rating: number;
  battleGames: number;
  battleWins: number;
};
export default function RatingsPage() {
  const query = useQuery({
    queryKey: ['ratings'],
    queryFn: () =>
      api<{ players: Player[]; me: Player | null; place: number | null }>(
        'ratings',
      ),
    refetchInterval: 15000,
  });
  const me = query.data?.me;
  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-5 md:py-8">
      <div className="mb-5 flex items-center gap-3">
        <Trophy className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Рейтинг киноманов</h1>
          <p className="text-sm text-muted-foreground">
            Случайные дуэли · 100 лучших игроков
          </p>
        </div>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="cinema-panel rounded-3xl border p-5 md:sticky md:top-5">
          <div className="flex items-center gap-4 md:flex-col md:text-center">
            <Avatar
              src={me?.avatarUrl}
              name={me?.nickname ?? '?'}
              className="size-16 text-2xl md:size-24 md:text-4xl"
            />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">
                {me?.nickname ?? 'Гость'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {query.data?.place
                  ? `Место #${query.data.place}`
                  : me
                    ? 'Первый батл впереди'
                    : 'Присоединяйтесь к игре'}
              </p>
            </div>
          </div>
          {me && (
            <div className="my-5 grid grid-cols-2 gap-3 border-y py-4 text-center">
              <div>
                <strong className="text-2xl text-primary">{me.rating}</strong>
                <p className="text-xs text-muted-foreground">рейтинг</p>
              </div>
              <div>
                <strong className="text-2xl">{me.battleWins}</strong>
                <p className="text-xs text-muted-foreground">побед</p>
              </div>
            </div>
          )}
          <Link
            href={me ? '/battle' : '/account'}
            className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            <Swords className="size-4" />
            {me ? 'Играть батл' : 'Войти в рейтинг'}
          </Link>
          {me && (
            <Link
              className="mt-3 block py-2 text-center text-sm text-muted-foreground hover:text-primary"
              href="/profile"
            >
              Профиль и аватарка →
            </Link>
          )}
        </aside>
        <section
          className="min-w-0 rounded-3xl border bg-card/50 p-2 sm:p-3"
          aria-label="Таблица рейтинга"
        >
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-primary">
              <Trophy className="size-4" />
              Общий рейтинг
            </span>
            <span className="text-xs text-muted-foreground">
              Elo · старт 1000
            </span>
          </div>
          <div className="md:max-h-[calc(100dvh-265px)] md:overflow-y-auto md:pr-1">
            {query.isPending ? (
              <p role="status" className="p-6">
                Загружаем игроков…
              </p>
            ) : query.error ? (
              <p role="alert" className="p-6">
                Рейтинг временно недоступен.
              </p>
            ) : !query.data?.players.length ? (
              <div className="py-16 text-center">
                <Trophy className="mx-auto mb-4 size-10 text-primary/50" />
                <h3 className="font-semibold">Первое место свободно</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Завершите батл, чтобы появиться в таблице.
                </p>
              </div>
            ) : (
              <ol className="space-y-2">
                {query.data.players.map((p, i) => (
                  <li
                    key={p.id}
                    className={`rating-row flex min-h-20 items-center gap-3 rounded-2xl border px-3 py-3 sm:gap-4 sm:px-5 ${p.id === me?.id ? 'border-primary ring-1 ring-primary/40' : 'border-border/60'} ${i < 3 ? 'bg-secondary' : 'bg-card/40'}`}
                  >
                    <span
                      className={`w-7 shrink-0 text-sm font-black sm:w-9 sm:text-lg ${i < 3 ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      #{i + 1}
                    </span>
                    <Avatar
                      src={p.avatarUrl}
                      name={p.nickname}
                      className="size-10 text-base sm:size-12"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold sm:text-base">
                        {p.nickname}
                        {p.id === me?.id && (
                          <span className="ml-2 text-xs font-normal text-primary">
                            вы
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.battleWins} побед · {p.battleGames} игр
                      </p>
                    </div>
                    <div className="text-right">
                      <strong className="text-lg tabular-nums sm:text-2xl">
                        {p.rating.toLocaleString('ru-RU')}
                      </strong>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        рейтинг
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Рейтинг меняется после батла с учётом силы соперника. Ничья учитывается,
        выход из начавшегося батла — поражение. Соло и игры с друзьями на
        рейтинг не влияют.
      </p>
    </main>
  );
}
