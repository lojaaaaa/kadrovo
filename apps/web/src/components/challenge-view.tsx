'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { modeLabels, type RoomSession } from '@filmless/contracts';
import { api, type AccountState } from '@/lib/account';
import { saveSession } from '@/lib/rooms';
import { Button } from './ui/button';
export function ChallengeView({ id }: { id: string }) {
  const router = useRouter();
  const account = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountState>('auth/me'),
  });
  const info = useQuery({
    queryKey: ['challenge', id],
    queryFn: () =>
      api<{
        rounds: number;
        mode: keyof typeof modeLabels;
        seconds: number;
        played: boolean;
        results: { nickname: string; score: number; solved: number }[];
      }>('experience/challenge/' + id),
    refetchInterval: 5000,
  });
  const join = useMutation({
    mutationFn: () =>
      api<RoomSession>('experience/challenge/' + id, 'POST', {
        nickname: account.data?.account?.nickname ?? 'Киноман',
      }),
    onSuccess: (s) => {
      saveSession(s);
      router.push('/room/' + s.code);
    },
  });
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-bold">Вызов другу</h1>
      {info.isPending ? (
        <p role="status">Загружаем вызов…</p>
      ) : info.error ? (
        <p role="alert">{info.error.message}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {info.data?.rounds} фильмов ·{' '}
            {info.data && modeLabels[info.data.mode]} · {info.data?.seconds}{' '}
            секунд. Одинаковые загадки и правила; учитывается первый результат.
          </p>
          <Button
            disabled={join.isPending || info.data?.played}
            onClick={() => join.mutate()}
          >
            {info.data?.played
              ? 'Результат уже записан'
              : join.isPending
                ? 'Открываем…'
                : 'Принять вызов'}
          </Button>
          <ol className="review-standings">
            {info.data?.results.map((p, i) => (
              <li key={i}>
                <span>
                  {i + 1}. {p.nickname} · угадано {p.solved}
                </span>
                <strong>{p.score} очков</strong>
              </li>
            ))}
          </ol>
        </>
      )}
      {join.error && <p role="alert">{join.error.message}</p>}
    </section>
  );
}
